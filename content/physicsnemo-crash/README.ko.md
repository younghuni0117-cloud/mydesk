> **원문과 번역 정보** — NVIDIA PhysicsNeMo의 「Machine Learning Surrogates for Automotive Crash Dynamics」 README를 한국어로 번역했습니다. 명령어, 파일명, 설정 키와 수치는 원문을 유지했으며, 별도 설명은 **역자 주**로 구분했습니다. 원문 확인일: 2026년 11월 9일. 기준 커밋: `7d23f081f7e5ab88b83a1205e98ddade3a1a984b`.
>
> [GitHub 원문](https://github.com/NVIDIA/physicsnemo/tree/7d23f081f7e5ab88b83a1205e98ddade3a1a984b/examples/structural_mechanics/crash) · [최신 원문](https://github.com/NVIDIA/physicsnemo/tree/main/examples/structural_mechanics/crash) · [번역 Markdown](content/physicsnemo-crash/README.ko.md) · [Apache 2.0 라이선스 전문](content/physicsnemo-crash/LICENSE.txt)

## 문제 개요

자동차의 충돌 안전성 평가는 차량 설계의 핵심 단계입니다. 전통적으로 엔지니어는 LS-DYNA와 같은 고정밀 유한요소(FE) 시뮬레이션을 이용해 구조물의 변형과 충돌 응답을 예측합니다. 정확하지만 계산 비용이 커서 설계를 반복 개선하는 속도에 제약이 생깁니다.

머신러닝(ML) 대리모델은 시뮬레이션 데이터로부터 입력과 출력 사이의 대응 관계를 직접 학습합니다. 이를 이용하면 수천 개 설계 후보의 시간에 따른 변형을 빠르게 예측할 수 있습니다.

이 예제는 충돌 동역학 모델링을 위한 통합 파이프라인을 보여 줍니다. GeoTransolver, Transolver, MeshGraphNet, FIGConvUNet 아키텍처와 여러 시간 전개(rollout) 방식을 지원합니다. LS-DYNA의 d3plot을 PhysicsNeMo-Curator로 전처리한 VTP 및 Zarr 형식을 사용합니다. 모듈식 구조이므로 사용자가 리더, 모델 아키텍처, 시간 전개 방식을 직접 추가할 수 있습니다. 데이터셋·모델·입력 특성이 다른 실험도 핵심 코드를 수정하지 않고 Hydra 실험 설정으로 관리합니다.

충돌 동역학에서 Transolver와 MeshGraphNet, 시간 전개 기법을 비교한 자세한 내용은 [Automotive Crash Dynamics Modeling Accelerated with Machine Learning](https://arxiv.org/pdf/2510.15201)을 참고하세요.

### 차체 골격(Body-in-White) 충돌 모델링

<details class="translation-image"><summary>차체 골격 충돌 애니메이션 보기</summary><figure><img src="https://raw.githubusercontent.com/NVIDIA/physicsnemo/7d23f081f7e5ab88b83a1205e98ddade3a1a984b/docs/img/crash/crash.gif" alt="차체 골격 충돌 애니메이션" loading="lazy" decoding="async"><figcaption>출처: NVIDIA PhysicsNeMo · 차체 골격 충돌 애니메이션</figcaption></figure></details>

### 크러시 캔(Crushcan) 모델링

<details class="translation-image"><summary>크러시 캔 압궤 애니메이션 보기</summary><figure><img src="https://raw.githubusercontent.com/NVIDIA/physicsnemo/7d23f081f7e5ab88b83a1205e98ddade3a1a984b/docs/img/crash/crushcan.gif" alt="크러시 캔 압궤 애니메이션" loading="lazy" decoding="async"><figcaption>출처: NVIDIA PhysicsNeMo · 크러시 캔 압궤 애니메이션</figcaption></figure></details>

### 범퍼 빔(Bumper Beam) 모델링

<details class="translation-image"><summary>범퍼 빔 충돌 애니메이션 보기</summary><figure><img src="https://raw.githubusercontent.com/NVIDIA/physicsnemo/7d23f081f7e5ab88b83a1205e98ddade3a1a984b/docs/img/crash/bumper_beam.gif" alt="범퍼 빔 충돌 애니메이션" loading="lazy" decoding="async"><figcaption>출처: NVIDIA PhysicsNeMo · 범퍼 빔 충돌 애니메이션</figcaption></figure></details>

## 사전 준비

**데이터:** PhysicsNeMo-Curator를 이용해 LS-DYNA 충돌 데이터를 VTP 또는 Zarr 형식으로 전처리해야 합니다. [Curator의 crashsim 예제](https://github.com/NVIDIA/physicsnemo-curator/tree/main/examples/cae/crashsim)와 아래의 데이터 전처리 절을 참고하세요.

**코드 의존성:**

```bash
pip install -r requirements.txt
```

MeshGraphNet 같은 그래프 기반 모델이나 그래프 데이터 파이프를 사용하려면 PhysicsNeMo의 `gnns` 추가 의존성도 설치합니다.

```bash
pip install "nvidia-physicsnemo[gnns]"
# or with uv:
uv sync --extra gnns
```

> **역자 주 — 실행 위치와 준비 범위:** `pip install -r requirements.txt`, `python train.py`, `python inference.py`는 저장소의 `examples/structural_mechanics/crash` 디렉터리 기준입니다. 아래 Curator 전처리 명령은 `examples/...` 경로를 사용하므로 해당 경로가 존재하는 저장소 루트에서 실행해야 합니다. 이 문서는 학습 절차를 설명하며, 실제 실행에는 준비된 PhysicsNeMo 환경과 LS-DYNA 데이터가 필요합니다. 원문의 그림이 데이터셋이나 학습 완료 모델의 제공을 의미하지는 않습니다.

## 데이터 전처리

PhysicsNeMo-Curator를 사용하면 LS-DYNA 충돌 시뮬레이션 데이터를 학습에 적합한 형식으로 변환할 수 있습니다. d3plot 파일을 시각화와 소규모 데이터셋에 적합한 **VTP**, 또는 대규모 ML 학습에 적합한 **Zarr**로 전처리합니다.

먼저 [PhysicsNeMo-Curator 설치 및 사용 안내](https://github.com/NVIDIA/physicsnemo-curator?tab=readme-ov-file#installation-and-usage)에 따라 설치합니다.

**VTP 형식으로 변환:**

```bash
export PYTHONPATH=$PYTHONPATH:examples &&
physicsnemo-curator-etl                                         \
    --config-dir=examples/structural_mechanics/crash/config     \
    --config-name=crash_etl                                     \
    serialization_format=vtp                                    \
    etl.source.input_dir=/data/crash_sims/                      \
    serialization_format.sink.output_dir=/data/crash_vtp/       \
    etl.processing.num_processes=4
```

**대규모 학습용 Zarr 형식으로 변환:**

```bash
export PYTHONPATH=$PYTHONPATH:examples &&
physicsnemo-curator-etl                                         \
    --config-dir=examples/structural_mechanics/crash/config     \
    --config-name=crash_etl                                     \
    serialization_format=zarr                                   \
    etl.source.input_dir=/data/crash_sims/                      \
    serialization_format.sink.output_dir=/data/crash_zarr/      \
    etl.processing.num_processes=4
```

Curator가 기대하는 LS-DYNA 데이터 디렉터리 구조는 다음과 같습니다.

```
crash_sims/
├── Run100/
│   ├── d3plot          # Required: binary mesh/displacement data
│   └── run100.k        # Optional: part thickness definitions
├── Run101/
│   ├── d3plot
│   └── run101.k
└── ...
```

`d3plot`은 메시·변위가 담긴 필수 이진 데이터입니다. `.k` 파일은 부품 두께 정의를 위한 선택 항목입니다.

### VTP 출력 형식

각 해석 실행(run)을 VTP 파일 하나로 저장하고, 모든 시간 단계의 변위를 필드로 포함합니다.

```
crash_processed_vtp/
├── Run100.vtp
├── Run101.vtp
└── ...
```

각 VTP에는 다음이 포함됩니다.

- `t=0`의 기준 좌표
- `displacement_t0.000`, `displacement_t0.005` 등의 변위 필드
- 절점 두께 및 그 밖의 절점 데이터 특성

이 형식은 예제의 VTP 리더와 바로 호환됩니다.

### Zarr 출력 형식

각 실행마다 그래프 구조가 미리 계산된 Zarr 저장소 하나를 만듭니다.

```
crash_processed_zarr/
├── Run100.zarr/
│   ├── mesh_pos       # (timesteps, nodes, 3) - temporal positions
│   ├── thickness      # (nodes,) - node features
│   └── edges          # (num_edges, 2) - pre-computed graph connectivity
├── Run101.zarr/
└── ...
```

각 Zarr 저장소의 주요 배열은 다음과 같습니다.

- `mesh_pos`: 전체 시간 이력의 위치. 변위로부터 위치를 다시 구성할 필요가 없습니다.
- `thickness`: 절점별 특성
- `edges`: 미리 계산한 그래프 연결 정보. 학습 중 간선을 다시 만들지 않습니다.

절점 필터링, 간선 생성, 두께 계산처럼 비용이 큰 전처리는 PhysicsNeMo-Curator에서 한 번만 수행합니다. 리더는 미리 계산된 배열을 불러오기만 합니다. 이 형식은 예제의 Zarr 리더와 바로 호환됩니다.

## 학습

학습은 `conf/` 디렉터리의 Hydra 설정으로 관리하며, 진입 스크립트는 `train.py`입니다.

### 설정 구조

```
conf/
├── bumper_geotransolver_oneshot.yaml       # ← self-contained experiment configs
├── bumper_geotransolver_time_conditional.yaml
├── crash_geotransolver_oneshot.yaml
├── bumper_geoflare_oneshot.yaml
├── crash_geoflare_oneshot.yaml
├── datapipe/                              # dataset configs (generic defaults)
│   ├── graph.yaml
│   └── point_cloud.yaml
├── model/                                 # model configs
│   ├── geotransolver_one_shot.yaml
│   ├── geotransolver_autoregressive_rollout_training.yaml
│   ├── geotransolver_one_step_rollout.yaml
│   ├── geotransolver_time_conditional.yaml
│   ├── transolver_one_shot.yaml
│   ├── figconvunet_one_shot.yaml
│   ├── mgn_one_shot.yaml
│   └── ...
├── reader/                                # reader configs
│   ├── vtp.yaml
│   └── zarr.yaml
├── training/default.yaml                  # generic training hyperparameters
└── inference/default.yaml                 # generic inference options
```

각 실험 설정은 reader, datapipe, model, training, inference의 기본값을 자체적으로 지정합니다. 데이터 경로, 데이터셋 크기, 특성 목록처럼 실험에 종속된 값도 해당 실험 설정 파일 안에 정의합니다.

### 학습 실행

**단일 GPU:**

```bash
python train.py --config-name=bumper_geotransolver_oneshot
```

**다중 GPU — Distributed Data Parallel(DDP):**

```bash
torchrun --nproc_per_node=<NUM_GPUS> train.py --config-name=bumper_geotransolver_oneshot
```

## 추론

학습한 모델을 테스트 충돌 실행에 적용하려면 `inference.py`를 사용합니다. 출력 경로는 `output_dir_pred/rank{N}/{run_name}/`입니다.

**현재 추론은 VTP 형식만 지원합니다.**

**단일 GPU:**

```bash
python inference.py --config-name=bumper_geotransolver_oneshot
```

**다중 GPU — DDP:**

```bash
torchrun --nproc_per_node=<NUM_GPUS> inference.py --config-name=bumper_geotransolver_oneshot
```

실행 목록은 rank별로 나눕니다. rank `r`은 `run_items[r::world_size]`를 처리합니다. 예측 메시는 기본적으로 `./predicted_vtps/` 아래의 `.vtp` 파일로 저장되며 ParaView로 열 수 있습니다.

> **역자 주 — 데이터 경로 지정:** 원문의 짧은 실행 명령만으로는 설정의 필수 값 `???`가 채워지지 않습니다. 실제 `bumper_geotransolver_oneshot.yaml`에는 학습·검증·테스트 경로와 전역 특성 JSON 경로를 지정해야 하는 항목이 있습니다. 학습 때는 `training.raw_data_dir`, `training.raw_data_dir_validation`, 필요한 경우 `training.global_features_filepath`를 설정하고, 추론 때는 `inference.raw_data_dir_test`와 학습 체크포인트·통계 경로도 확인하세요. Hydra의 `chdir: True` 설정에 따른 실행 디렉터리 이동을 고려하면 데이터 경로는 절대 경로로 지정하는 편이 명확합니다.

## 가드레일: 학습 분포 밖 입력 감지

선택적으로 분포 밖 입력(Out-of-Distribution, **OOD**) 감지 기능을 사용할 수 있습니다. 학습 중 기준을 보정하고, 추론 입력이 학습 분포에서 벗어났을 때 경고를 냅니다. 감시 대상은 두 가지입니다.

- **전역 파라미터:** 전역 임베딩 각 채널의 범위. 예: `velocity_x`, `thickness_scale`.
- **형상:** 풀링한 형상 잠재벡터 사이의 k-최근접 이웃(kNN) 거리.

이 기능을 켜려면 생성한 `GeoTransolver`를 `physicsnemo.experimental.guardrails.embedded`의 `GuardedGeoTransolver`로 감쌉니다. 래퍼는 forward hook으로 두 대상을 관찰하며, 실제 순전파 계산은 변경하지 않고 원래 모델에 위임합니다.

```python
from physicsnemo.experimental.guardrails.embedded import (
    GuardedGeoTransolver,
    OODGuardConfig,
)

model = instantiate(cfg.model)  # your GeoTransolver (or rollout subclass)
model = GuardedGeoTransolver(
    model,
    OODGuardConfig(
        buffer_size=121,  # FIFO buffer; typically = num_training_samples
        knn_k=10,  # k for geometry kNN distance
        sensitivity=1.5,  # threshold multiplier on 99th-percentile kNN dist
    ),
)
```

평소처럼 `model.train()`과 `model.eval()`을 호출하면 됩니다. 학습 중에는 기준 통계를 수집하고 추론 중에는 입력을 검사합니다.

### 파라미터 의미

- **`buffer_size`:** 학습 중 풀링된 형상 잠재벡터를 보관하는 FIFO 순환 버퍼의 용량입니다. 버퍼 내용으로 kNN 임계값을 계산합니다. 모든 샘플이 보정에 반영되도록 학습 데이터 크기 이상으로 설정하세요. DDP에서는 rank마다 독립적인 버퍼를 유지하고 distributed sampler가 데이터를 섞으므로, 몇 epoch가 지나면 각 rank의 FIFO가 데이터 대부분을 거칩니다. 메모리 사용량은 `buffer_size × head_dim × 4`바이트이며 일반적으로 1MB보다 훨씬 작습니다.
- **`knn_k`:** kNN 거리 계산에 사용할 이웃 수입니다. 작은 `k`는 고립된 학습 이상치에 더 민감하고, 큰 `k`는 더 부드럽지만 여러 군집의 경계를 흐릴 수 있습니다. 기본값 `10`은 버퍼 크기가 약 100에서 수천인 경우에 사용할 수 있습니다.
- **`sensitivity`:** 학습 kNN 거리의 99백분위수에 곱하는 OOD 임계값 배수입니다. **값이 클수록 덜 민감하며 경고가 줄어듭니다.** 정상 검증 데이터에서도 경고가 나오면 값을 높이고, 알려진 OOD 입력을 놓치면 낮춥니다.

### 학습 데이터 크기별 시작값

| 학습 샘플 수 | `buffer_size` | `knn_k` | `sensitivity` |
| --- | --- | --- | --- |
| 약 100 | 100–200 | 5–10 | 1.5 |
| 약 500 | 500–1000 | 10 | 1.5 |
| 5,000 이상 | 데이터셋 크기와 동일 | 10–15 | 1.5 |

검증 데이터에서 경고가 발생하면 `sensitivity`를 2.0–3.0 쪽으로 높이고, 알려진 OOD 입력이 통과하면 1.0 쪽으로 낮춥니다.

모델을 래퍼로 감싼 뒤에는 추가 변경이 필요하지 않습니다. 학습 중에는 보정 통계를 조용히 수집하고, 추론 중 학습 범위를 벗어난 샘플에는 Python logger를 통해 `OOD Guard: geometry sample ...` 또는 `OOD Guard: global_embedding dim ...` 형태의 경고를 냅니다. **경고가 발생해도 추론은 중단되지 않습니다.**

## 실험 설정

각 실험은 `conf/` 안의 독립적인 YAML 파일입니다. 모든 기본값과 실험별 설정을 파일 하나에 모읍니다.

### 실험 설정 파일의 구성

데이터 경로는 설정 파일에 직접 쓰거나 명령행에서 덮어써야 합니다. 학습에는 `raw_data_dir`, `raw_data_dir_validation`, 추론에는 `raw_data_dir_test`가 필요합니다. 설정 값을 `???`로 두면 실행 시 반드시 지정하도록 만들 수 있습니다.

```yaml
# conf/my_experiment.yaml

hydra:
  job:
    chdir: True
  run:
    dir: ./outputs/

experiment_name: "My-Experiment"

defaults:
  - reader: vtp
  - datapipe: point_cloud
  - model: geotransolver_one_shot
  - training: default
  - inference: default
  - _self_

# ┌───────────────────────────────────────────┐
# │                   Data                    │
# └───────────────────────────────────────────┘

training:
  raw_data_dir: ???              # set in config or via CLI
  raw_data_dir_validation: ???   # set in config or via CLI
  global_features_filepath: ???  # or null if not using global features
  num_time_steps: 51
  num_training_samples: 121
  num_validation_samples: 5

inference:
  raw_data_dir_test: ???         # set in config or via CLI

# ┌───────────────────────────────────────────┐
# │            Datapipe features              │
# └───────────────────────────────────────────┘

datapipe:
  static_features: []  # per-node static features (e.g., thickness)
  dynamic_targets:    # per-node time-series targets (e.g., strain, stress)
    - effective_plastic_strain
    - stress_vm
  global_features:   # per-run scalar features (loaded from JSON)
    - velocity_x
    - thickness_scale
    - rwall_origin_y
  sample_type: all_time_steps  # or one_time_step for time-conditional models
```

### 제공되는 실험

| 파일 | 데이터셋 | 모델 | 학습 실행 |
| --- | --- | --- | --- |
| `bumper_geotransolver_oneshot.yaml` | 범퍼 빔(VTP) | GeoTransolver one-shot | `python train.py --config-name=bumper_geotransolver_oneshot` |
| `bumper_geotransolver_time_conditional.yaml` | 범퍼 빔(VTP) | GeoTransolver time-conditional | `python train.py --config-name=bumper_geotransolver_time_conditional` |
| `crash_geotransolver_oneshot.yaml` | 차체 골격 충돌(VTP) | GeoTransolver one-shot | `python train.py --config-name=crash_geotransolver_oneshot` |
| `bumper_geoflare_oneshot.yaml` | 범퍼 빔(VTP) | GeoFLARE one-shot | `python train.py --config-name=bumper_geoflare_oneshot` |
| `crash_geoflare_oneshot.yaml` | 차체 골격 충돌(VTP) | GeoFLARE one-shot | `python train.py --config-name=crash_geoflare_oneshot` |

### 시간 전개 방식 선택

실험 설정의 모델과 데이터 파이프 조합으로 다음 두 방식을 선택합니다.

| 방식 | 모델 | datapipe의 `sample_type` | 동작 |
| --- | --- | --- | --- |
| **One-shot — 한 번에 전체 예측** | `geotransolver_one_shot` | `all_time_steps` | 실행 하나당 샘플 하나. 초기 상태 t0로부터 전체 시간 이력 `[N, T-1, Fo]`를 순전파 한 번으로 예측합니다. 학습 비용이 낮고 정확도도 경쟁력이 있습니다. |
| **Time-conditional — 시간 조건부** | `geotransolver_time_conditional` | `one_time_step` | 실행·시간 단계마다 샘플 하나. 정규화 시간 `t/(T-1)`을 조건으로 한 단계 `[N, Fo]`를 예측합니다. 원문은 긴 시간 구간의 정확도를 장점으로 설명하며, 학습 비용은 더 높습니다. 추론에서는 항상 전체 시간 이력을 전개합니다. |

빠른 반복 실험이나 계산 자원이 제한된 경우에는 **one-shot**, 검증 품질을 우선하는 경우에는 **time-conditional**을 사용하라는 것이 원문의 권장사항입니다. 아래 개발 팁의 비교표도 함께 확인하세요.

`geotransolver_autoregressive_rollout_training`과 `geotransolver_one_step_rollout`이라는 추가 방식도 있지만, 완성된 실험 설정으로 제공되지는 않습니다. `conf/model/`에서 해당 모델을 선택하고 데이터 파이프를 맞춰 구성해야 합니다.

### 새 실험 추가하기

1. 위 템플릿을 바탕으로 `conf/<my_experiment>.yaml`을 만듭니다.
2. `defaults`에 reader, datapipe, model, training, inference의 기본값을 지정합니다.
3. 학습용 `raw_data_dir`, `raw_data_dir_validation`, 추론용 `raw_data_dir_test`, `num_time_steps`, `num_training_samples` 등 필수 값을 지정합니다. 설정 파일에 직접 값을 쓰거나 `???`를 두고 적절한 실행 명령에서 전달합니다.
4. 모델과 맞는 `datapipe.sample_type`을 지정합니다. one-shot은 `all_time_steps`, time-conditional은 `one_time_step`입니다.
5. 전역 특성을 사용하면 `global_features_filepath`를 지정하고, 사용하지 않으면 `null`로 둡니다.
6. 필요하면 실험 파일에서 `model.out_dim: 150`, `training.epochs: 5000` 등 모델·학습 값을 덮어쓰거나 `conf/model/`에 새 모델 설정을 추가해 선택합니다.
7. `python train.py --config-name=<my_experiment>`로 실행합니다.

`defaults`에서 모델을 바꿀 수도 있습니다. 시간 조건부 학습에는 전용 실험 설정을 사용합니다.

```yaml
# Use bumper_geotransolver_time_conditional.yaml, or in your experiment:
defaults:
  - reader: vtp
  - model: geotransolver_time_conditional  # Override model
  - training: default
  - _self_
```

## 데이터 파이프: 입력 구성과 정규화

데이터 파이프는 리더가 반환한 데이터를 모델에 넣을 수 있는 `SimSample`로 변환합니다. 샘플 하나는 충돌 실행 하나이거나, `sample_type`에 따라 특정 실행의 특정 시간 단계 하나입니다.

입력 `x`에는 초기 좌표 `x['coords']`(t0의 `[N, 3]`)와 `x['features']`(`[N, F]`)가 들어갑니다. `features`는 설정 순서에 따라 정적 특성과 펼친 동적 특성을 결합한 것입니다. 타깃 `y`의 크기는 `[N, T-1, Fo]`이며, 위치만 예측하면 `Fo=3`, 변형률·응력 같은 `dynamic_targets`가 있으면 `Fo=3+sum(C_k)`입니다.

설정은 `conf/datapipe/`에 있습니다. MeshGraphNet용 `graph`, GeoTransolver·Transolver 등 점군 기반 모델용 `point_cloud`가 있습니다. 두 방식 모두 `static_features`(예: `[thickness]`), `dynamic_features`, `dynamic_targets`, `global_features`를 사용합니다. 절점 특성이 필요 없으면 `static_features: []`로 둡니다.

위치와 특성의 통계는 학습 분할에서 계산하고 `./stats/`에 저장한 뒤 평가·추론 때 재사용합니다. 파일은 `node_stats.json`, `feature_stats.json`, 그래프 방식의 경우 `edge_stats.json`입니다.

### `all_time_steps`와 `one_time_step`

- **`all_time_steps` — one-shot:** 실행마다 샘플 하나를 만듭니다. `x`에는 `coords`와 `features`가 있고, `y`는 전체 시간 이력 `[N, T-1, Fo]`입니다. 데이터셋 길이는 `num_samples`입니다.
- **`one_time_step` — time-conditional:** 실행의 시간 단계마다 샘플 하나를 만듭니다. 샘플은 `(batch_idx, time_idx)`에 대응하며 `x['time']=time_idx/(T-1)`을 추가합니다. `y`는 한 단계 `[N, Fo]`, 데이터셋 길이는 `num_samples * (T-1)`입니다. 추론은 항상 `all_time_steps`를 사용해 전체 시간 이력을 받습니다.

리더는 `(srcs, dsts, point_data)`를 반환합니다. 그래프 데이터 파이프는 초기 위치로 간선 특성을 만들어 PyG `Data`를 구성하고, 점군 데이터 파이프는 연결 정보를 사용하지 않습니다. 모델은 `x['coords']`, `x['features']`를 직접 사용합니다. `_feature_slices`는 특성 이름과 열 범위를 대응시켜 진단에 활용합니다. `static_features: []`일 때 폭이 0인 특성 텐서도 처리합니다.

### 전역 특성

전역 특성은 충돌 속도, 두께 배율, 벽 위치처럼 **한 실행 전체에 적용되는 스칼라**입니다. 메시 절점마다 달라지는 특성과 구분하며, 하나의 전역 조건 벡터로 모델에 전달합니다.

#### JSON 파일 형식

학습·검증·테스트 분할이 같은 JSON 파일을 공유합니다. 최상위 키는 실행 ID, 각 값은 `{특성명: 스칼라 실수}` 사전입니다.

```json
{
  "Run100": {
    "velocity_x": -5.0,
    "thickness_scale": 1.0,
    "rwall_origin_y": 0.0
  },
  "Run101": {
    "velocity_x": -5.0,
    "thickness_scale": 0.7,
    "rwall_origin_y": 120.0
  },
  ...
}
```

실행 ID는 해당 데이터 파일의 **확장자를 제외한 이름**과 일치해야 합니다. `Run100.vtp`와 `Run100.zarr/` 모두 `"Run100"`에 대응합니다. 값은 Python에서 직렬화할 수 있는 실수여야 하며, 정수는 실수로 변환됩니다.

> **역자 주:** 위 원문 예시의 `...`는 실행 항목이 더 이어진다는 표시입니다. 실제 JSON 파일에서는 `...`와 그 앞의 불필요한 쉼표를 제거하고 유효한 JSON으로 작성해야 합니다.

#### 설정

설정 파일이나 명령행으로 JSON 경로를 지정하고, 사용할 키를 선언합니다. 예: `training.global_features_filepath=/path/to/global_features.json`.

```yaml
# conf/my_experiment.yaml
training:
  global_features_filepath: ???  # or a concrete path

datapipe:
  global_features:       # subset of keys to extract; order defines the global vector
    - velocity_x
    - thickness_scale
    - rwall_origin_y
```

모든 실행의 JSON 항목에는 선언한 키가 **전부** 있어야 합니다. 하나라도 빠지면 데이터셋 생성 중 `KeyError`가 발생합니다. JSON에 있더라도 `global_features`에 선언하지 않은 키는 무시하므로, 별도의 메타데이터를 더 저장해 둘 수 있습니다.

전역 특성을 완전히 끄려면 `global_features_filepath`를 생략하거나 `null`로 두고 데이터 파이프의 `global_features: null`을 지정합니다.

#### 데이터 파이프와 모델의 사용 방식

`__getitem__`에서 선택한 스칼라를 스칼라 텐서 사전으로 바꾸어 `SimSample`에 붙입니다.

```python
sample.global_features = {
    "velocity_x": tensor(-5.0),
    "thickness_scale": tensor(1.0),
    "rwall_origin_y": tensor(0.0),
}
```

모델의 순전파에서는 이 값들을 하나의 전역 임베딩 벡터로 쌓아 네트워크에 전달합니다. 모델 설정의 **`global_dim`은 선택한 전역 특성 개수와 같아야 합니다.**

```yaml
# conf/model/geotransolver_one_shot.yaml (or in experiment model overrides)
global_dim: 3   # must match len(datapipe.global_features)
```

`global_features`가 `null`이면 `sample.global_features`는 `None`입니다. 모델도 이를 처리해야 합니다. 원문은 현재 `GeoTransolverOneShot`만 전역 특성을 사용하고 다른 모델은 무시한다고 설명합니다.

## 리더: VTP·Zarr 읽기와 사용자 리더 추가

리더는 전처리된 시뮬레이션 데이터를 열어 데이터 파이프가 사용할 배열을 만듭니다. 원시 LS-DYNA d3plot은 먼저 PhysicsNeMo-Curator로 VTP 또는 Zarr로 변환해야 합니다. Hydra 설정으로 리더를 교체할 수 있어 새로운 형식을 추가하기 쉽습니다.

### 내장 VTP 리더: PolyData

`vtp_reader.py`는 디렉터리의 `.vtp` 파일 각각을 별도 실행으로 취급합니다. `poly.point_data`에 `displacement_t0.000`, `displacement_t0.005` 등의 벡터 배열이 있어야 합니다. 보조 규칙으로 더 넓은 `displacement_t*` 패턴도 허용합니다.

리더는 다음 작업을 수행합니다.

- `poly.points`에서 기준 좌표를 읽습니다.
- 시간별 절대 위치를 `[t0: coords, t>0: coords + displacement_t]`로 구성합니다.
- PolyData 면의 연결 정보를 추출해 중복 없는 간선으로 바꿉니다.
- 두께·탄성계수 등 모든 절점 데이터 필드를 동적으로 추출합니다.
- `(srcs, dsts, point_data)`를 반환합니다. `point_data`에는 `'coords': [T, N, 3]`와 특성 배열들이 들어갑니다.

변위 이외의 모든 절점 필드를 읽어 데이터 파이프에 제공하므로, VTP에 두께나 탄성계수 배열이 있다면 해당 특성을 데이터 파이프 설정에 추가해 사용할 수 있습니다.

**리더 설정:**

```yaml
# conf/reader/vtp.yaml
_target_: vtp_reader.Reader
```

**실험의 기본 리더 선택:**

```yaml
# conf/my_experiment.yaml
defaults:
  - reader: vtp
  - datapipe: point_cloud
  - model: geotransolver_one_shot
  - training: default
  - inference: default
  - _self_
```

**데이터 파이프에서 사용할 특성 지정:**

```yaml
# conf/my_experiment.yaml
datapipe:
  static_features: [thickness]  # or [] for no features
```

### 내장 Zarr 리더

`zarr_reader.py`는 PhysicsNeMo-Curator가 만든 전처리 Zarr 저장소를 읽습니다. 절점 필터링, 간선 생성, 두께 계산은 이미 ETL 단계에서 완료되어 있습니다.

- `mesh_pos`에서 미리 계산한 시간별 위치를 직접 읽습니다. 변위를 이용한 재구성은 필요 없습니다.
- 미리 계산한 간선을 읽으므로 연결 정보를 간선으로 다시 바꾸지 않습니다.
- 두께 등 모든 절점 데이터 필드를 동적으로 추출합니다.
- VTP 리더와 비슷하게 `(srcs, dsts, point_data)`를 반환합니다.

예상 데이터 구조는 `<DATA_DIR>/*.zarr/`이며, `.zarr` 디렉터리 하나가 실행 하나입니다. 각 저장소에는 `mesh_pos: [T, N, 3]`, `edges: [E, 2]`, `thickness` 등의 특성 배열 `[N]` 또는 `[N, K]`가 있어야 합니다.

**리더 설정:**

```yaml
# conf/reader/zarr.yaml
_target_: zarr_reader.Reader
```

**실험의 기본 리더 선택:**

```yaml
# conf/my_experiment.yaml
defaults:
  - reader: zarr
  - datapipe: point_cloud
  - model: geotransolver_one_shot
  - training: default
  - inference: default
  - _self_
```

**Zarr에 저장된 필드와 일치하는 특성 지정:**

```yaml
# conf/my_experiment.yaml
datapipe:
  static_features: [thickness]  # Must match fields stored in Zarr
```

### 리더별 입력 배치

- **VTP 리더:** `<DATA_DIR>/*.vtp`. 각 파일이 실행 하나이며, 변위는 point_data의 3성분 배열이어야 합니다. 이름은 `displacement_t0.000` 등의 형식이고, 보조 규칙으로 `displacement_t*`도 허용합니다.
- **Zarr 리더:** `<DATA_DIR>/*.zarr/`. 각 저장소가 실행 하나이며, 미리 계산한 `mesh_pos`, `edges` 및 특성 배열이 있어야 합니다.

### 사용자 리더 작성

Hydra가 생성할 수 있는 함수 또는 클래스를 구현하고, 호출 결과로 `(srcs, dsts, point_data)`를 반환하도록 만듭니다. 앞의 두 값은 실행별 간선을 표현하는 정수 배열의 목록입니다. 그래프를 만들지 않으면 빈 목록이어도 됩니다. `point_data`는 실행별 Python 사전 목록입니다.

각 사전에는 `[T, N, 3]` 배열인 `'coords'`와 설정에 지정한 각 특성의 배열이 있어야 합니다. 특성 배열은 `[N]` 또는 `[N, K]`이며 `'coords'`와 동일한 절점 인덱스를 사용해야 합니다. 클래스 리더는 선택적으로 Hydra의 `split` 인자(예: `"train"`, `"test"`)를 받아 VTP 프레임 저장 여부 등을 결정할 수 있습니다.

YAML에서 점으로 연결한 경로로 클래스를 지정합니다.

```yaml
# conf/reader/my_reader.yaml
_target_: my_reader.MyReader
# any constructor kwargs here, e.g. thresholds or unit conversions
```

이후 실험 설정의 `defaults`에 `- reader: my_reader`를 추가합니다. 데이터 파이프는 리더에 `data_dir`, `num_samples`, `split`, 선택적 `logger`를 전달하고 위의 세 값을 기대합니다. 실행별 `'coords'`와 설정된 특성 배열만 올바르게 채우면 정규화·배치·그래프 생성·시간 전개는 다른 코드를 바꾸지 않고 동작합니다.

향후 추가 인자가 생길 수 있으므로 선택적 매개변수와 `**kwargs`를 받도록 작성하는 것이 좋습니다.

```python
class MyReader:
    def __init__(self, some_option: float = 1.0):
        self.some_option = some_option

    def __call__(
        self,
        data_dir: str,
        num_samples: int,
        split: str | None = None,
        logger=None,
        **kwargs,
    ): ...
```

이 패턴을 사용하면 프레임워크에 선택적 인자가 추가되더라도 리더를 유지할 수 있습니다.

> **역자 주 — 특성 설정 이름:** README의 일부 문장과 FAQ는 `features`라는 일반적인 이름을 사용하지만, 현재 실험 설정에서는 `static_features`, `dynamic_features`, `dynamic_targets`처럼 구분된 키를 사용합니다. 실제 YAML과 데이터 파이프의 인자를 기준으로 맞추세요.

## 후처리와 평가

원문은 후처리 디렉터리를 `postprocessing/`이라고 표기하며, 정량·정성 평가용 스크립트를 소개합니다.

> **역자 주 — 실제 경로:** 확인한 커밋의 디렉터리 이름은 **`post_processing/`**입니다. 아래 코드 블록은 번역의 추적 가능성을 위해 원문의 명령을 그대로 옮겼습니다. 실제 실행 시 `postprocessing/`를 `post_processing/`로 바꿔 사용하세요. 결과 경로도 실제 `rank{N}/{run_name}` 구조에 맞춰 지정해야 합니다.

### 상대 L² 오차: `compute_l2_error.py`

실행별 각 시간 단계에서 위치의 상대 오차를 계산하고, 그래프와 선택적인 CSV 파일을 만듭니다.

```bash
python postprocessing/compute_l2_error.py \
    --predicted_parent ./predicted_vtps \
    --exact_parent ./exact_vtps \
    --output_plot rel_error.png \
    --output_csv rel_error.csv
```

### 프로브 운동학: `compute_probe_kinematics.py`

운전석·동승석 토 팬(toe pan, 발밑 차체 패널)의 지정된 프로브 절점에서 변위·속도·가속도 이력을 추출하고, 기준값(GT)과 예측값의 비교 그래프를 만듭니다.

```bash
python postprocessing/compute_probe_kinematics.py \
    --pred_dir ./predicted_vtps/run_001 \
    --exact_dir ./exact_vtps/run_001 \
    --driver_points "70658-70659,70664" \
    --passenger_points "70676-70679" \
    --dt 0.005 \
    --output_plot probe_kinematics.png
```

### 단면 비교: `plot_cross_section.py`

지정된 단면의 2차원 슬라이스로 예측 변형과 기준 변형을 비교합니다.

```bash
python postprocessing/plot_cross_section.py \
    --pred_dir ./predicted_vtps/run_001 \
    --exact_dir ./exact_vtps/run_001 \
    --output_file cross_section.png
```

`run_post_processing.sh`를 사용하면 여러 실행에 대한 평가 작업을 자동화할 수 있습니다.

## 개발 팁과 성능 비교

### 동역학 예측 방식

1. **Time-conditional:** 원문은 긴 시간 구간에서 가장 좋은 정확도를 제공하는 방식으로 권장합니다. 검증 품질이 우선일 때 고려합니다.
2. **One-shot:** 훨씬 낮은 학습 비용으로 경쟁력 있는 정확도를 냅니다. 빠른 반복 실험이나 예측 상태변수 수가 적을 때 고려합니다.
3. **AR-rollout:** 짧은 구간에는 잘 동작할 수 있지만, 긴 전개를 학습할 때 불안정해지는 경향이 있습니다.
4. **Teacher-forcing:** 학습 손실은 낮아도 추론에서 일반화가 잘 되지 않는 경우가 많아, 원문은 배포용으로 피할 것을 권장합니다.

| 방식 | 범퍼(T=50) 초/epoch | 범퍼 검증 MSE | 차량 충돌(T=14) 초/epoch | 차량 충돌 검증 MSE |
| --- | --- | --- | --- | --- |
| One-shot | 1 | 5.42e-3 | 6.4 | 2.32e-4 |
| Time-conditional | 29 | 4.12e-3 | 40.8 | 2.54e-4 |
| AR-rollout | 37 | 불안정 | 61.6 | 2.27e-4 |
| Teacher-forcing | 29 | 0.3 | — | — |

<details class="translation-image"><summary>시간 전개 방식별 검증 손실 비교 보기</summary><figure><img src="https://raw.githubusercontent.com/NVIDIA/physicsnemo/7d23f081f7e5ab88b83a1205e98ddade3a1a984b/docs/img/crash/Time_integraton_val_loss.png" alt="시간 전개 방식별 검증 손실 비교" loading="lazy" decoding="async"><figcaption>출처: NVIDIA PhysicsNeMo · 시간 전개 방식별 검증 손실 비교</figcaption></figure></details>

> **역자 주 — 비교표 해석:** 위 수치와 권장 문구는 원문에 실린 실험 결과입니다. 차량 충돌 열에서는 AR-rollout의 MSE가 2.27e-4, one-shot이 2.32e-4, time-conditional이 2.54e-4이므로 time-conditional이 모든 데이터에서 가장 좋다는 의미는 아닙니다. 학습 시간은 원문 실험 환경의 값이며, 독자의 GPU에서도 동일한 시간이 걸린다는 보장은 없습니다. 원문 표에는 하드웨어 등 모든 재현 조건이 함께 적혀 있지는 않습니다.

### 모델과 최적화기

5. **One-shot 정확도 순위:** 원문은 GeoFlare > GeoTransolver > Transolver > MeshGraphNet 순서로 소개하며, 정확도가 우선이면 GeoFlare를 권장합니다.
6. **Muon:** 일반적으로 검증 MSE에서 Adam보다 좋은 결과를 보이지만 과적합될 수 있으므로 검증 손실을 관찰하고 조기 종료나 정규화를 고려합니다.

**One-shot 테스트 상대 L² 오차:**

| 모델 | 범퍼(Adam) | 범퍼(Muon) | 차량 충돌(Adam) | 차량 충돌(Muon) |
| --- | --- | --- | --- | --- |
| Transolver | 9.37e-3 | 9.12e-3 | 1.60e-2 | 1.60e-2 |
| GeoTransolver | 9.40e-3 | 7.32e-3 | 1.40e-2 | 1.33e-2 |
| GeoFlare | **8.73e-3** | **6.80e-3** | **1.16e-2** | **8.95e-3** |

**Adam — 차량 충돌 프로브 위치의 테스트 MSE:**

| 모델 | 운전석 위치 | 운전석 속도 | 운전석 가속도 | 동승석 위치 | 동승석 속도 | 동승석 가속도 |
| --- | --- | --- | --- | --- | --- | --- |
| Transolver | 2.21e-3 | 8.21e-1 | 5.60e+3 | 2.43e-3 | 9.31e-1 | 6.81e+3 |
| GeoTransolver | 1.51e-3 | 5.74e-1 | 3.99e+3 | 1.92e-3 | 7.03e-1 | 5.53e+3 |
| GeoFlare | **1.01e-3** | **4.38e-1** | **2.99e+3** | **1.19e-3** | **5.16e-1** | **3.93e+3** |

**Muon — 차량 충돌 프로브 위치의 테스트 MSE:**

| 모델 | 운전석 위치 | 운전석 속도 | 운전석 가속도 | 동승석 위치 | 동승석 속도 | 동승석 가속도 |
| --- | --- | --- | --- | --- | --- | --- |
| Transolver | 2.63e-3 | 8.41e-1 | 2.14e+3 | 2.21e-3 | 7.25e-1 | 2.24e+3 |
| GeoTransolver | 1.84e-3 | 6.09e-1 | 1.71e+3 | 1.72e-3 | 5.53e-1 | 1.80e+3 |
| GeoFlare | **7.18e-4** | **2.71e-1** | **1.27e+3** | **6.52e-4** | **2.53e-1** | **1.45e+3** |

<details class="translation-image"><summary>모델별 테스트 MSE 비교 보기</summary><figure><img src="https://raw.githubusercontent.com/NVIDIA/physicsnemo/7d23f081f7e5ab88b83a1205e98ddade3a1a984b/docs/img/crash/Test_MSE_models.png" alt="모델별 테스트 MSE 비교" loading="lazy" decoding="async"><figcaption>출처: NVIDIA PhysicsNeMo · 모델별 테스트 MSE 비교</figcaption></figure></details>

## 앞으로 할 일: 원문의 TODO

- **전역 특성 정규화:** `velocity_x`, `thickness_scale`, `rwall_origin_y` 등은 현재 정규화 없이 전달됩니다. 특성별 평균·표준편차 등을 계산하고 적용해 절점 특성·위치와 일관되게 정규화하는 기능이 필요합니다.
- **동적 타깃 정규화:** 위치는 정규화하지만 `effective_plastic_strain`, `stress_vm` 등 동적 타깃은 현재 `y`에 정규화 없이 들어갑니다. 타깃별 평균·표준편차와 VTP 출력 시 역정규화 기능이 필요합니다.
- **`batch_size > 1` 지원:** 샘플마다 절점 수가 달라 현재 `batch_size=1`을 사용합니다. 처리량을 높이려면 패딩이나 배치 로직을 추가해야 합니다.

## 문제 해결과 FAQ

### VTP에 변위 필드가 없습니다

point_data에 `displacement_t0.000`, `displacement_t0.005` 같은 이름의 벡터 배열이 있는지 확인합니다. 리더는 보조 규칙으로 `displacement_t*`도 허용합니다.

### 절점 특성 없이 사용하고 싶습니다

원문은 `features: []`를 지정하라고 설명합니다. 그러면 `x['features']`의 크기는 `[N, 0]`이 되고, 시간 전개 과정에서 모델 입력에 속도와 필요시 시간을 계속 결합합니다. 현재 설정에서 정적 특성을 끄는 구체적인 키는 앞서 설명한 `static_features: []`입니다.

### Transolver의 `functional_dim`을 0으로 해도 됩니까?

전체 MLP 입력 차원이 0보다 클 때만 가능합니다. 예를 들어 비정형 형상에 필요한 임베딩이나 시간 정보가 있어야 합니다. 이 파이프라인의 시간 전개는 항상 위치 임베딩을 제공하므로 특성 목록을 비워도 됩니다.

### 사용자 리더가 `split` 또는 `logger`를 받지 못합니다

선택 인자가 추가되어도 대응할 수 있도록 `__call__(..., split: str | None = None, logger=None, **kwargs)` 형태로 구현합니다.

## 참고 문헌과 출처

- [Automotive Crash Dynamics Modeling Accelerated with Machine Learning](https://arxiv.org/pdf/2510.15201)
- [GeoTransolver: Learning Physics on Irregular Domains Using Multi-scale Geometry Aware Physics Attention Transformer](https://arxiv.org/pdf/2512.20399)
- [Transolver: A Fast Transformer Solver for PDEs on General Geometries](https://arxiv.org/pdf/2402.02366)
- [Learning Mesh-Based Simulation with Graph Networks](https://arxiv.org/pdf/2010.03409)
- [기준 버전 README 원문](https://github.com/NVIDIA/physicsnemo/blob/7d23f081f7e5ab88b83a1205e98ddade3a1a984b/examples/structural_mechanics/crash/README.md)
- [실제 후처리 디렉터리](https://github.com/NVIDIA/physicsnemo/tree/7d23f081f7e5ab88b83a1205e98ddade3a1a984b/examples/structural_mechanics/crash/post_processing)
- [범퍼 GeoTransolver 실험 설정](https://github.com/NVIDIA/physicsnemo/blob/7d23f081f7e5ab88b83a1205e98ddade3a1a984b/examples/structural_mechanics/crash/conf/bumper_geotransolver_oneshot.yaml)
- [추론 기본 설정](https://github.com/NVIDIA/physicsnemo/blob/7d23f081f7e5ab88b83a1205e98ddade3a1a984b/examples/structural_mechanics/crash/conf/inference/default.yaml)

**저작권과 변경 고지:** 원문·예제·그림의 출처는 NVIDIA PhysicsNeMo입니다. 저장소 라이선스 고지: Copyright 2022 NVIDIA Corporation. 함께 확인한 예제 코드와 설정 파일의 고지: Copyright (c) 2023–2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. Apache License 2.0에 따라 배포됩니다. My Desk는 README의 한국어 번역, 읽기용 목차·그림 접기, 별도 표시된 역자 주를 추가했습니다. [포함된 라이선스 전문](content/physicsnemo-crash/LICENSE.txt)과 [원문 README 사본](content/physicsnemo-crash/README.original.md)을 확인할 수 있습니다. 그림은 동일 기준 커밋의 원본 파일을 연결합니다.
