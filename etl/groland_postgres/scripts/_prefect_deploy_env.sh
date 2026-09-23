#!/usr/bin/env bash

# Shared helper for Prefect deployment scripts:
# - keeps PREFECT_API_URL/PREFECT_HOME explicit
# - preserves env when UV_BIN uses sudo

resolve_uv_command() {
  local raw_uv="$1"
  local -a uv_cmd
  local token
  local has_preserve_env="0"
  local preserve_env_vars="PREFECT_API_URL,DATAOPS_PREFECT_API_URL,PREFECT_HOME,PREFECT_LOGGING_SETTINGS_PATH,HOME,PATH"

  is_command_runnable() {
    local cmd_name="$1"
    if [[ "$cmd_name" == */* ]]; then
      [[ -x "$cmd_name" ]]
      return
    fi
    command -v "$cmd_name" > /dev/null 2>&1
  }

  read -r -a uv_cmd <<< "$raw_uv"
  if (( ${#uv_cmd[@]} == 0 )); then
    echo "UV_BIN cannot be empty" >&2
    return 2
  fi

  if [[ "${uv_cmd[0]}" != "sudo" ]] && ! is_command_runnable "${uv_cmd[0]}"; then
    if [[ "${uv_cmd[0]}" == "uv" ]]; then
      if ! command -v sudo > /dev/null 2>&1; then
        echo "UV_BIN=uv is not executable and sudo is unavailable. Please install uv in PATH." >&2
        return 2
      fi
      echo "UV_BIN=uv is not executable in current shell, falling back to sudo uv." >&2
      uv_cmd=(
        "sudo"
        "--preserve-env=${preserve_env_vars}"
        "uv"
        "${uv_cmd[@]:1}"
      )
    else
      echo "UV_BIN command is not executable: ${uv_cmd[0]}" >&2
      return 2
    fi
  fi

  if [[ "${uv_cmd[0]}" == "sudo" ]]; then
    for token in "${uv_cmd[@]}"; do
      if [[ "$token" == "-E" || "$token" == "--preserve-env" || "$token" == --preserve-env=* ]]; then
        has_preserve_env="1"
        break
      fi
    done

    if [[ "$has_preserve_env" == "0" ]]; then
      uv_cmd=(
        "sudo"
        "--preserve-env=${preserve_env_vars}"
        "${uv_cmd[@]:1}"
      )
    fi
  fi

  printf '%s\0' "${uv_cmd[@]}"
}

prepare_prefect_deploy_env() {
  local project_root="$1"
  local preferred_home="${2:-}"

  if [[ -n "$project_root" ]]; then
    if [[ ! -d "$project_root" ]]; then
      echo "PROJECT_ROOT does not exist: $project_root" >&2
      return 2
    fi
    cd "$project_root"
  fi

  PREFECT_API_URL="${PREFECT_API_URL:-${DATAOPS_PREFECT_API_URL:-http://127.0.0.1:4200/api}}"
  if [[ -n "$preferred_home" ]]; then
    PREFECT_HOME="$preferred_home"
  else
    PREFECT_HOME="${PREFECT_HOME:-$project_root/.prefect_home}"
  fi
  PREFECT_LOGGING_SETTINGS_PATH="${PREFECT_LOGGING_SETTINGS_PATH:-$PREFECT_HOME/logging.yml}"

  export PREFECT_API_URL
  export PREFECT_HOME
  export PREFECT_LOGGING_SETTINGS_PATH

  mkdir -p "$PREFECT_HOME"
}

prefect_uv_run() {
  local raw_uv="$1"
  local logging_settings_path="${PREFECT_LOGGING_SETTINGS_PATH:-$PREFECT_HOME/logging.yml}"
  shift

  if [[ -n "${PREFECT_BIN:-}" ]]; then
    if [[ ! -x "$PREFECT_BIN" ]]; then
      echo "PREFECT_BIN is not executable: $PREFECT_BIN" >&2
      return 2
    fi
    env \
      PREFECT_API_URL="$PREFECT_API_URL" \
      DATAOPS_PREFECT_API_URL="${DATAOPS_PREFECT_API_URL:-$PREFECT_API_URL}" \
      PREFECT_HOME="$PREFECT_HOME" \
      PREFECT_LOGGING_SETTINGS_PATH="$logging_settings_path" \
      "$PREFECT_BIN" "$@"
    return
  fi

  local -a uv_cmd
  while IFS= read -r -d '' token; do
    uv_cmd+=("$token")
  done < <(resolve_uv_command "$raw_uv")

  env \
    PREFECT_API_URL="$PREFECT_API_URL" \
    DATAOPS_PREFECT_API_URL="${DATAOPS_PREFECT_API_URL:-$PREFECT_API_URL}" \
    PREFECT_HOME="$PREFECT_HOME" \
    PREFECT_LOGGING_SETTINGS_PATH="$logging_settings_path" \
    "${uv_cmd[@]}" run prefect "$@"
}
