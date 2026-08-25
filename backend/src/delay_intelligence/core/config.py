"""Strongly-typed and YAML configuration loader for delay intelligence system."""

from pathlib import Path
from typing import Any, Dict, Optional, Union

import yaml

from delay_intelligence.core.exceptions import ConfigurationError


def find_config_dir(custom_path: Optional[Union[str, Path]] = None) -> Path:
    """Locate the configs/ directory within the repository.

    Searches:
    1. custom_path (if provided)
    2. Current working directory ./configs
    3. Parent directory ../configs
    4. Package root ../../configs relative to this file

    Returns:
        Path object pointing to existing configs directory.

    Raises:
        ConfigurationError: If configs directory cannot be found.
    """
    if custom_path:
        p = Path(custom_path)
        if p.is_dir():
            return p.resolve()
        raise ConfigurationError(f"Specified configuration directory does not exist: {custom_path}")

    candidates = [
        Path.cwd() / "configs",
        Path.cwd() / "delay_intelligence_system" / "configs",
        Path(__file__).resolve().parent.parent.parent.parent / "configs",
        Path(__file__).resolve().parent.parent.parent / "configs",
    ]

    for candidate in candidates:
        if candidate.is_dir():
            return candidate.resolve()

    raise ConfigurationError("Could not locate 'configs/' directory in candidate paths.")


def load_config(
    config_name: str,
    config_dir: Optional[Union[str, Path]] = None,
) -> Dict[str, Any]:
    """Load and parse a YAML configuration file by name.

    Args:
        config_name: Name of config file (e.g. 'base', 'data', 'data.yaml').
        config_dir: Optional path to directory containing YAML configs.

    Returns:
        Parsed configuration dictionary.

    Raises:
        ConfigurationError: If the configuration file is missing or invalid YAML.
    """
    if not config_name.endswith((".yaml", ".yml")):
        config_name = f"{config_name}.yaml"

    cfg_dir = find_config_dir(config_dir)
    file_path = cfg_dir / config_name

    if not file_path.is_file():
        raise ConfigurationError(f"Configuration file not found: {file_path}")

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
            if data is None:
                return {}
            if not isinstance(data, dict):
                raise ConfigurationError(
                    f"Configuration file {config_name} must contain a top-level dictionary mapping."
                )
            return data
    except yaml.YAMLError as exc:
        raise ConfigurationError(f"Error parsing YAML file {file_path}: {exc}") from exc
    except Exception as exc:
        raise ConfigurationError(f"Unexpected error loading {file_path}: {exc}") from exc


def get_data_paths(
    config_dir: Optional[Union[str, Path]] = None,
    base_dir: Optional[Union[str, Path]] = None,
) -> Dict[str, Path]:
    """Retrieve absolute file/directory paths for all configured raw datasets.

    Args:
        config_dir: Optional path to directory containing data.yaml.
        base_dir: Optional base directory to resolve relative paths against.
                  Defaults to the project root directory.

    Returns:
        Dict mapping dataset keys ('scms', 'olist', 'dataco') to absolute resolved Path objects.

    Raises:
        ConfigurationError: If data.yaml is missing or does not define datasets.
    """
    data_cfg = load_config("data", config_dir=config_dir)
    datasets = data_cfg.get("datasets", {})

    if not datasets:
        raise ConfigurationError("No 'datasets' section defined in data.yaml configuration.")

    resolved_paths: Dict[str, Path] = {}

    # Determine reference project root
    if base_dir is not None:
        root = Path(base_dir).resolve()
    else:
        # Defaults to repository root containing configs/
        cfg_dir = find_config_dir(config_dir)
        root = cfg_dir.parent.resolve()

    for key, spec in datasets.items():
        if not isinstance(spec, dict):
            continue

        raw_path_str = spec.get("raw_path") or spec.get("raw_dir")
        if not raw_path_str:
            continue

        candidate = Path(raw_path_str)
        if not candidate.is_absolute():
            resolved = (root / candidate).resolve()
            # If not found relative to project root, try relative to workspace root (parent of project)
            if not resolved.exists():
                workspace_candidate = (root.parent / candidate.name).resolve()
                if workspace_candidate.exists():
                    resolved = workspace_candidate
        else:
            resolved = candidate.resolve()

        resolved_paths[key] = resolved

    return resolved_paths
