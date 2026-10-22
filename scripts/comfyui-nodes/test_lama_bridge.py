"""CPU-only boundary tests; does not claim real-model image quality."""
import importlib.util
from pathlib import Path
import sys
import tempfile
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch

import torch

folder_paths = ModuleType("folder_paths")
sys.modules["folder_paths"] = folder_paths
comfy = ModuleType("comfy")
management = ModuleType("comfy.model_management")
management.get_torch_device = lambda: torch.device("cpu")
management.free_memory = lambda *_: None
comfy.model_management = management
sys.modules["comfy"] = comfy
sys.modules["comfy.model_management"] = management
spec = importlib.util.spec_from_file_location("loomic_lama", Path(__file__).parent / "loomic_image_ops" / "__init__.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class FakeModel:
    def to(self, *_): return self
    def eval(self): return self
    def __call__(self, image, mask):
        assert image.shape[-1] % 8 == image.shape[-2] % 8 == 0
        return torch.full_like(image, 0.75)


class LaMaBridgeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="loomic-lama-test-")
        folder_paths.models_dir = self.temp.name
        self.weights = Path(self.temp.name) / "lama" / "big-lama.pt"
        self.weights.parent.mkdir()

    def tearDown(self):
        self.temp.cleanup()

    def test_missing_weights_never_trigger_a_download(self):
        with self.assertRaisesRegex(RuntimeError, "Missing models"):
            module.LoomicLaMaErase().erase(torch.zeros(1, 17, 23, 3), torch.zeros(1, 17, 23))

    def test_rejects_an_unverified_torchscript_file(self):
        self.weights.write_bytes(b"not-a-model")
        with self.assertRaisesRegex(RuntimeError, "checksum mismatch"):
            module.LoomicLaMaErase().erase(torch.zeros(1, 17, 23, 3), torch.zeros(1, 17, 23))

    def test_odd_sizes_batch_and_alpha_preserve_every_unmasked_pixel(self):
        self.weights.write_bytes(b"fixture")
        original = torch.rand(2, 17, 23, 4)
        mask = torch.zeros(1, 17, 23)
        mask[:, 4:12, 5:17] = 1
        digest = SimpleNamespace(hexdigest=lambda: "e3aa4aaa15225a33ec84f9f4bc47e500")
        with patch.object(module.hashlib, "file_digest", return_value=digest), patch.object(torch.jit, "load", return_value=FakeModel()):
            result, = module.LoomicLaMaErase().erase(original, mask)
        self.assertEqual(tuple(result.shape), tuple(original.shape))
        outside = (mask[0] == 0)
        self.assertTrue(torch.equal(result[:, outside, :3], original[:, outside, :3]))
        self.assertTrue(torch.equal(result[..., 3], original[..., 3]))
        self.assertTrue(torch.all(result[:, 4:12, 5:17, :3] == 0.75))


if __name__ == "__main__":
    unittest.main(verbosity=2)
