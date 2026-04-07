# Control

`app.routers.control`


### `delete_model`

```python
def delete_model(model_id: str)
```

Remove a model from the local HuggingFace cache.

## `PullRequest`


### `list_models`

```python
def list_models()
```


### `pull_model`

```python
def pull_model(req: PullRequest)
```


### `list_downloads`

```python
def list_downloads()
```


### `reconcile_downloads`

```python
def reconcile_downloads()
```

Force re-check of all tracked downloads against the HF cache.

Promotes downloads that finished (no .incomplete files, present in cache)
to "complete" and clears them from the active tracker.

### `search_hub`

```python
def search_hub(q: str = Query(..., min_length=1), limit: int = Query(20, le=50))
```


### `get_model_detail`

```python
def get_model_detail(model_id: str)
```

