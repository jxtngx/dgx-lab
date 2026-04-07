# Datasets

`app.routers.datasets`


### `list_datasets`

```python
def list_datasets()
```


### `search_hub`

```python
def search_hub(q: str = Query(..., min_length=1), limit: int = Query(20, le=50))
```


## `PullDatasetRequest`


### `pull_dataset`

```python
def pull_dataset(req: PullDatasetRequest)
```


### `list_downloads`

```python
def list_downloads()
```


### `list_dataset_files`

```python
def list_dataset_files(dataset_id: str)
```


### `preview_dataset`

```python
def preview_dataset(dataset_id: str, file: str = Query(None, description='Specific file to preview'), offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=500))
```


## `QueryRequest`


### `query_dataset`

```python
def query_dataset(req: QueryRequest)
```

Filter, sort, aggregate dataset files using PyArrow compute.
