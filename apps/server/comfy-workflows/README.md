# ComfyUI workflows

## Local Windows image topbar profile

For the installed LayerStyle nodes and local model layout:

```dotenv
COMFYUI_BASE_URL=http://127.0.0.1:8188
COMFYUI_TIMEOUT_MS=600000
COMFYUI_OPS_PROFILE=layerstyle
COMFYUI_MODELS_DIR=E:\ComfyUI_windows_portable\ComfyUI\models
COMFYUI_EDIT_MODEL=flux2-klein-9b
```

The profile maps cutout to LayerStyle's non-meta BiRefNet loader, upscale to
`4x-UltraSharp\\4x-UltraSharp.pth`, erase to the local `LoomicLaMaErase` bridge,
layers to the native Qwen-Image-Layered FP8 graph, and editing to FLUX.2.
Vectorization uses local ImageTracer and emits SVG, not a diffusion model.
The image topbar inspects actual nodes and filename lists; missing weights
disable only the affected action and expose a reason. The API and Agent tool
also reject missing dependencies before queuing GPU work.

Install `scripts/comfyui-nodes/loomic_image_ops/__init__.py` as
`ComfyUI/custom_nodes/loomic_image_ops/__init__.py`, then restart ComfyUI.
It loads only the verified `models/lama/big-lama.pt` TorchScript file; it has
no network calls or automatic downloads. The user's existing LayerStyle LaMa
node depends on IOPaint's Python-3.13-incompatible `imghdr` import, so the small
bridge avoids that CLI import. Erase runs at 512px and composites only inside
the original-resolution mask. Pixels outside the mask are retained before
the canvas's normal WebP encoding.

BiRefNet reuses the local cached safetensors weights, repackaged (not retrained)
as `models/BiRefNet/pth/BiRefNet-general-local-cache.pth` for LayerStyle's
`LayerMask: LoadBiRefNetModel` node. This avoids the Transformers meta-tensor
initialization failure of the other installed loader.

Qwen layers require:

- `diffusion_models/qwen_image_layered_fp8mixed.safetensors`
- `text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors`
- `vae/qwen_image_layered_vae.safetensors`

Files are the official [Comfy-Org repack](https://huggingface.co/Comfy-Org/Qwen-Image-Layered_ComfyUI)
and the encoder linked by the [official workflow](https://github.com/Comfy-Org/workflow_templates/blob/main/templates/image_qwen_image_layered.json).
The UI offers 2–8 layers (default 4), plus an optional overall scene description.
The local profile uses the original 50-step, CFG 4 quality settings and the
official non-tiled layered RGBA VAE path. Layers retain the same
640px frame and alpha so they can be re-aligned. Model segmentation may leave
faint residuals or low-content layers; it is not an exact reconstruction guarantee.
Repeated edits are inserted in free space rather than covering older results.
Upscaling transparent cutouts preserves their scaled alpha channel.

On this Windows 24GB GPU, the supplied ComfyUI launcher uses
`--disable-dynamic-vram --disable-smart-memory --reserve-vram 4`. FLUX and Z-Image
use tiled VAE processing; Qwen layers retain the official VAE path with enough
memory left by model offloading. This prevents cached weights from forcing WDDM shared-
memory paging during repeated model switches. No Windows registry or global
environment setting is changed. Original launch arguments and failed-attempt
logs are retained in the workspace backups.

## Local text-to-image provider

Setting `COMFYUI_BASE_URL=http://127.0.0.1:8188` also registers
`comfyui/z-image-turbo` in Loomic's image model picker and Agent image tool.
The API server and worker must both be restarted after changing the environment.
Use the canvas toolbar **AI 生成图片** button for direct generation without an LLM.

Required local files: `diffusion_models/z_image_turbo_bf16.safetensors`,
`text_encoders/qwen_3_4b.safetensors`, and `vae/ae.safetensors`.
The provider uses the native Z-Image Turbo template (8 steps, CFG 1,
AuraFlow shift 3, res_multistep/simple) documented by
[ComfyUI](https://docs.comfy.org/tutorials/image/z-image/z-image-turbo).
No models or custom nodes are downloaded automatically.

Local generation costs zero Loomic credits. Standard is 1K, HD 1.5K,
Ultra 2K (long edge, subject to the account's existing quality limits).
This initial provider supports text-to-image only and rejects reference images.
PNG output is persisted in Supabase Storage through the normal Loomic pipeline;
the original is also saved in ComfyUI's `output/loomic/` folder.
`COMFYUI_TIMEOUT_MS=600000` allows up to ten minutes for cold model loading.
This image provider does not replace the chat Agent's LLM or its API credentials.

### Local FLUX.2 image editing

Set `COMFYUI_EDIT_MODEL=flux2-klein-9b` to use the installed native
FLUX.2 Klein 9B distilled workflow for `edit_image`. Required files:
`flux-2-klein-9b-fp8.safetensors` (diffusion_models),
`qwen_3_8b_fp8mixed.safetensors` (text_encoders), and
`flux2-vae.safetensors` (vae). The graph follows ComfyUI's bundled
`image_flux2_klein_image_edit_9b_distilled` template, uses source-image
reference latents, four sampling steps, and tiled VAE decoding.
The original canvas image is retained and the edited image is inserted beside it.
Omit the setting (or select `qwen-image-2.1`) to keep the original Qwen workflow.
Z-Image Turbo generation remains text-only; edits use this separate tool.

API-format workflows used by the image operations in
`src/features/image-ops`. Copied from
[ComfyArt](https://github.com/jtydhr88/ComfyArt) (MIT, see `LICENSE-ComfyArt`).

Nodes whose inputs are filled at runtime carry a tag in `_meta.title`
(`@image`, `@save`, …); `src/generation/comfyui/workflows.ts` finds them by tag,
so node ids can change freely when a workflow is re-exported.

| Operation | Workflow | Models (ComfyUI folder) / custom nodes |
|---|---|---|
| remove_background | `cutout-birefnet` | `birefnet.safetensors` (background_removal) |
| upscale_image | `upscale-ultrasharp-4x` | `4x-UltraSharp.pth` (upscale_models) |
| erase_region | `erase-lama` | `big-lama.pt` (inpaint) + [comfyui-inpaint-nodes](https://github.com/Acly/comfyui-inpaint-nodes) |
| edit_image | `edit-qwen-image-2.1` | `qwen_image_2.1_int8_convrot.safetensors` (diffusion_models), `qwen3vl_8b_int8_convrot.safetensors` (text_encoders), `qwen_image_2.1_vae_bf16.safetensors` (vae) |
| split_layers | `layers-qwen-image-layered` | `qwen_image_layered_bf16.safetensors` (diffusion_models), `qwen_image_layered_vae.safetensors` (vae), `qwen_2.5_vl_7b_fp8_scaled.safetensors` (text_encoders) |

Check each model's licence before commercial use.

Point the server at ComfyUI with `COMFYUI_BASE_URL` (e.g. `http://127.0.0.1:8188`).
Without it, remove_background falls back to a solid-colour key, upscale_image
to a plain Lanczos resize, and the model-only operations report that ComfyUI
is not configured. vectorize_image never needs ComfyUI.
