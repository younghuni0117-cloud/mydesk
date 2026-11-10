"""Check the chapter 1 Windows Triton installation with one small GPU kernel.

Run in the course environment: python education/preparation/check_triton_gpu.py
The JIT kernel lives in this file so Triton can read its source reliably.
"""
import torch
import triton
import triton.language as tl
from packaging.version import Version


@triton.jit
def scale_kernel(source, destination, count: tl.constexpr, width: tl.constexpr):
    indices = tl.program_id(0) * width + tl.arange(0, width)
    valid = indices < count
    values = tl.load(source + indices, mask=valid, other=0.0)
    tl.store(destination + indices, values * 2.0 + 1.0, mask=valid)


def main():
    print('PyTorch:', torch.__version__)
    print('Triton:', triton.__version__)
    torch_version = Version(torch.__version__)
    triton_version = Version(triton.__version__)
    if torch_version.release[:2] != (2, 14) or triton_version.release[:2] != (3, 8):
        raise RuntimeError('이 교재의 설치 조합은 PyTorch 2.14와 Triton 3.8입니다.')
    if not torch.cuda.is_available():
        raise RuntimeError('CUDA GPU를 사용할 수 없습니다. 5.1.3절의 GPU 확인 결과를 점검하세요.')
    values = torch.arange(257, device='cuda', dtype=torch.float32)
    result = torch.empty_like(values)
    scale_kernel[(triton.cdiv(values.numel(), 128),)](
        values, result, count=values.numel(), width=128)
    torch.cuda.synchronize()
    torch.testing.assert_close(result, values * 2.0 + 1.0, rtol=0, atol=0)
    # Check the import used by PyTorch's optional FLOP counter as well.
    from triton.runtime.jit import JITFunction
    assert isinstance(scale_kernel, JITFunction)
    print('GPU:', torch.cuda.get_device_name(0))
    print('Triton GPU 계산: PASS')


if __name__ == '__main__':
    main()
