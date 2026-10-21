# ComfyUI workflows

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
