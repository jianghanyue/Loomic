"""Small local-only LaMa bridge for ComfyUI, independent of legacy IOPaint CLI.

Uses the public Sanster/models big-lama.pt TorchScript export. No downloads,
package installation, external commands, or cloud endpoints are performed.
"""
import hashlib
from pathlib import Path

import torch
import torch.nn.functional as F
import folder_paths
import comfy.model_management as model_management


class LoomicLaMaErase:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"image": ("IMAGE",), "mask": ("MASK",)}}

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "erase"
    CATEGORY = "Loomic/Image"

    def erase(self, image, mask):
        path = Path(folder_paths.models_dir) / "lama" / "big-lama.pt"
        if not path.is_file():
            raise RuntimeError("Missing models/lama/big-lama.pt; no automatic download is performed")
        with path.open("rb") as stream:
            digest = hashlib.file_digest(stream, "md5").hexdigest()
        if digest != "e3aa4aaa15225a33ec84f9f4bc47e500":
            raise RuntimeError("Local big-lama.pt checksum mismatch")

        device = model_management.get_torch_device()
        model_management.free_memory(4 * 1024 ** 3, device)
        model = torch.jit.load(str(path), map_location="cpu").eval().to(device)
        outputs = []
        if mask.ndim == 2:
            mask = mask.unsqueeze(0)
        try:
            with torch.inference_mode():
                for index, original in enumerate(image):
                    height, width = original.shape[:2]
                    rgb = original[..., :3].permute(2, 0, 1).unsqueeze(0).float().to(device)
                    selected = mask[min(index, len(mask) - 1)].unsqueeze(0).unsqueeze(0).float().to(device)
                    selected = (F.interpolate(selected, size=(height, width), mode="nearest") > 0).float()
                    pad = (0, (-width) % 8, 0, (-height) % 8)
                    padded_rgb = F.pad(rgb, pad, mode="replicate")
                    padded_mask = F.pad(selected, pad, mode="replicate")
                    predicted = model(padded_rgb, padded_mask)[..., :height, :width].clamp(0, 1)
                    # Preserve every pixel outside the user's mask.
                    blended = predicted * selected + rgb * (1 - selected)
                    output = blended[0].permute(1, 2, 0).cpu()
                    if original.shape[-1] == 4:
                        output = torch.cat((output, original[..., 3:4].cpu()), dim=-1)
                    outputs.append(output)
        finally:
            model.to("cpu")
        return (torch.stack(outputs),)


NODE_CLASS_MAPPINGS = {"LoomicLaMaErase": LoomicLaMaErase}
NODE_DISPLAY_NAME_MAPPINGS = {"LoomicLaMaErase": "Loomic · Local LaMa Erase"}
