# LangSmith Traces

`app.routers.langsmith_traces`


### `langsmith_status`

```python
def langsmith_status()
```


### `list_runs`

```python
def list_runs(limit: int = Query(50, le=200), project: str | None = None)
```


### `list_sessions`

```python
def list_sessions()
```


### `list_feedback`

```python
def list_feedback(run_id: str | None = None, limit: int = Query(50, le=200))
```


### `get_run`

```python
def get_run(run_id: str)
```

