from __future__ import annotations

import logging
import os

log = logging.getLogger(__name__)

SEED_EXAMPLES = [
    {
        "inputs": {"question": "How does the Monitor tool work?"},
        "outputs": {"answer": "The Monitor tool uses nvidia-smi and psutil to display GPU utilization, memory usage, temperature, power draw, process tables, and system timelines. The backend router is at backend/app/routers/monitor.py and reads hardware data via psutil and nvidia-smi subprocess calls."},
    },
    {
        "inputs": {"question": "What is the memory budget for the DGX Spark?"},
        "outputs": {"answer": "The DGX Spark has 128 GB unified LPDDR5X memory shared between CPU and GPU, with ~273 GB/s bandwidth. These values are configured in backend/app/config.py via DGX_LAB_MEMORY_TOTAL_GB and DGX_LAB_MEMORY_BW_MAX_GBS environment variables."},
    },
    {
        "inputs": {"question": "How do I add a new tool to DGX Lab?"},
        "outputs": {"answer": "Adding a new tool requires: 1) Create a new router in backend/app/routers/, 2) Register it in backend/app/main.py with app.include_router(), 3) Create a new page at frontend/apps/web/app/(tools)/<tool>/page.tsx, 4) Add a sidebar entry in frontend/apps/web/components/app-sidebar.tsx. The add-tool skill at .cursor/skills/add-tool/SKILL.md has the full walkthrough."},
    },
    {
        "inputs": {"question": "What does the ML Engineer own?"},
        "outputs": {"answer": "The ML Engineer owns model pre-training and post-training -- SFT, LoRA, QLoRA, GRPO, DPO, distillation, QAT -- plus evaluation, quantization, and memory-aware deployment. They report to the AI Engineer (team lead). Their definition is in .cursor/agents/ml-engineer.md."},
    },
    {
        "inputs": {"question": "How is the frontend structured?"},
        "outputs": {"answer": "The frontend is a Turborepo monorepo with Bun workspaces. apps/web is the Next.js 16 app (App Router, Turbopack) with tool pages under app/(tools)/. packages/ui contains shared components built with shadcn v4 and Tailwind CSS 4. Data fetching uses custom useFetch and usePoll hooks that call the FastAPI backend via /api/* routes proxied through nginx."},
    },
]

DATASET_NAME = "dgx-lab-agent-evals"


def create_eval_dataset():
    api_key = os.getenv("LANGSMITH_API_KEY")
    if not api_key:
        log.warning("LANGSMITH_API_KEY not set, skipping eval dataset creation")
        return None

    try:
        from langsmith import Client

        client = Client()

        existing = list(client.list_datasets(dataset_name=DATASET_NAME))
        if existing:
            log.info("Eval dataset '%s' already exists", DATASET_NAME)
            return existing[0]

        dataset = client.create_dataset(
            dataset_name=DATASET_NAME,
            description="Evaluation dataset for the DGX Lab agent. Tests codebase knowledge, tool understanding, and team awareness.",
        )

        for example in SEED_EXAMPLES:
            client.create_example(
                inputs=example["inputs"],
                outputs=example["outputs"],
                dataset_id=dataset.id,
            )

        log.info("Created eval dataset '%s' with %d examples", DATASET_NAME, len(SEED_EXAMPLES))
        return dataset

    except Exception as exc:
        log.error("Failed to create eval dataset: %s", exc)
        return None


def run_evaluation():
    api_key = os.getenv("LANGSMITH_API_KEY")
    if not api_key:
        log.warning("LANGSMITH_API_KEY not set, skipping evaluation")
        return None

    try:
        from langsmith import Client, evaluate

        from app.agent.chain import invoke

        client = Client()

        datasets = list(client.list_datasets(dataset_name=DATASET_NAME))
        if not datasets:
            log.info("No eval dataset found, creating one")
            create_eval_dataset()
            datasets = list(client.list_datasets(dataset_name=DATASET_NAME))
            if not datasets:
                return None

        def predict(inputs: dict) -> dict:
            result = invoke(question=inputs["question"])
            return {"answer": result["answer"]}

        def correctness(run, example) -> dict:
            prediction = run.outputs.get("answer", "") if run.outputs else ""
            reference = example.outputs.get("answer", "") if example.outputs else ""

            pred_lower = prediction.lower()
            ref_words = reference.lower().split()
            key_terms = [w for w in ref_words if len(w) > 4]
            if not key_terms:
                return {"key": "correctness", "score": 0.0}

            matches = sum(1 for term in key_terms if term in pred_lower)
            score = min(matches / max(len(key_terms), 1), 1.0)
            return {"key": "correctness", "score": round(score, 3)}

        results = evaluate(
            predict,
            data=DATASET_NAME,
            evaluators=[correctness],
            experiment_prefix="dgx-lab-agent",
        )

        log.info("Evaluation complete")
        return results

    except Exception as exc:
        log.error("Evaluation failed: %s", exc)
        return None
