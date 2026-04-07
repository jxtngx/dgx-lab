import logging

POLL_PATHS = {
    "/api/monitor/status",
    "/api/monitor/processes",
    "/api/monitor/timeline",
    "/api/control/models",
    "/api/control/models/downloads",
    "/api/datasets/downloads",
    "/api/curator/jobs",
    "/api/designer/jobs",
    "/api/automodel/jobs",
    "/api/health",
    "/api/langsmith/status",
    "/api/langsmith/sessions",
}


class PollFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        return not any(path in msg for path in POLL_PATHS)
