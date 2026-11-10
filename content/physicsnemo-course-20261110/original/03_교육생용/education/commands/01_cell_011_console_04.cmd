python -m pip install -r education/requirements-course.txt "torch==2.14.1+cu130" "torchvision==0.29.1+cu130" --extra-index-url https://download.pytorch.org/whl/cu130

python -m pip check

python -c "import torch, physicsnemo, triton; print('torch:', torch.__version__); print('CUDA build:', torch.backends.cuda.is_built()); print('CUDA runtime:', torch.version.cuda); print('GPU available:', torch.cuda.is_available()); print('physicsnemo import: OK'); print('Triton:', triton.__version__)"
