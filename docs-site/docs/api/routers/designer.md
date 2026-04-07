# Designer

`app.routers.designer`


## `GenerateRequest`


### `get_status`

```python
def get_status()
```


### `list_providers`

```python
def list_providers()
```


### `list_models`

```python
def list_models()
```


### `list_datasets`

```python
def list_datasets()
```


### `preview_dataset`

```python
def preview_dataset(dataset_path: str, limit: int = Query(20, le=200))
```


### `start_generation`

```python
def start_generation(req: GenerateRequest)
```


### `list_jobs`

```python
def list_jobs()
```

