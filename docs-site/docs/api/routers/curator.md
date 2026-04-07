# Curator

`app.routers.curator`


## `PipelineRequest`


### `get_status`

```python
def get_status()
```


### `list_stages`

```python
def list_stages()
```


### `list_datasets`

```python
def list_datasets()
```


### `preview_dataset`

```python
def preview_dataset(dataset_path: str, limit: int = Query(20, le=200))
```


### `run_pipeline`

```python
def run_pipeline(req: PipelineRequest)
```


### `list_jobs`

```python
def list_jobs()
```

