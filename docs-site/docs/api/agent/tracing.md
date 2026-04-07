# Tracing

`app.agent.tracing`


### `configure_tracing`

```python
def configure_tracing()
```


### `export_trace_locally`

```python
def export_trace_locally(trace_id: str, run_name: str, inputs: dict, outputs: dict, duration_ms: int, tokens: int = 0, cost: float = 0.0, status: str = 'success', error: str | None = None)
```

