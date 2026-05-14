#!/usr/bin/env bash
set -euo pipefail

# ─── 配置 ───
REPO="echoVic/new-api-toolkit"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PEM_FILE="${PROJECT_DIR}/new-api-toolkit.pem"

# ─── 从 manifest.json 读取版本号 ───
VERSION=$(grep '"version"' "${PROJECT_DIR}/manifest.json" | head -1 | sed 's/.*: *"\(.*\)".*/\1/')
TAG="v${VERSION}"
ZIP_NAME="new-api-toolkit-${TAG}.zip"
CRX_NAME="new-api-toolkit-${TAG}.crx"
DIST_DIR="${PROJECT_DIR}/dist"

echo "==> 构建 New API Toolkit ${TAG}"

# ─── 清理 ───
rm -rf "${DIST_DIR}"
mkdir -p "${DIST_DIR}"

# ─── 打包 ZIP ───
echo "==> 打包 ZIP..."
TEMP_DIR=$(mktemp -d)
# 复制源文件（排除不需要的内容）
rsync -a --exclude='.git' --exclude='dist' --exclude='*.pem' --exclude='scripts' --exclude='README.md' \
  --exclude='CONTRIBUTING.md' --exclude='.github' --exclude='docs' \
  "${PROJECT_DIR}/" "${TEMP_DIR}/new-api-toolkit/"
(cd "${TEMP_DIR}" && zip -r "${DIST_DIR}/${ZIP_NAME}" new-api-toolkit/)
rm -rf "${TEMP_DIR}"
echo "    ✓ ${ZIP_NAME}"

# ─── 打包 CRX ───
echo "==> 打包 CRX..."
if [ ! -f "${CHROME}" ]; then
  echo "    ⚠ Chrome 未找到，跳过 CRX 打包"
  CRX_BUILT=false
else
  CRX_ARGS="--pack-extension=${PROJECT_DIR} --no-message-box"
  if [ -f "${PEM_FILE}" ]; then
    CRX_ARGS="${CRX_ARGS} --pack-extension-key=${PEM_FILE}"
  fi
  # Chrome 会在 PROJECT_DIR 的父目录生成 .crx
  PARENT_DIR="$(dirname "${PROJECT_DIR}")"
  "${CHROME}" ${CRX_ARGS} 2>/dev/null || true
  CRX_OUTPUT="${PARENT_DIR}/new-api-toolkit.crx"
  if [ -f "${CRX_OUTPUT}" ]; then
    mv "${CRX_OUTPUT}" "${DIST_DIR}/${CRX_NAME}"
    # 保存新生成的 pem（如果之前没有）
    NEW_PEM="${PARENT_DIR}/new-api-toolkit.pem"
    if [ -f "${NEW_PEM}" ] && [ ! -f "${PEM_FILE}" ]; then
      mv "${NEW_PEM}" "${PEM_FILE}"
      echo "    ✓ 已保存私钥到 new-api-toolkit.pem"
    elif [ -f "${NEW_PEM}" ] && [ "${NEW_PEM}" != "${PEM_FILE}" ]; then
      rm -f "${NEW_PEM}"
    fi
    CRX_BUILT=true
    echo "    ✓ ${CRX_NAME}"
  else
    echo "    ⚠ CRX 打包失败"
    CRX_BUILT=false
  fi
fi

# ─── 发布到 GitHub Release ───
echo "==> 发布 GitHub Release ${TAG}..."

# 检查 tag 是否已存在
if gh release view "${TAG}" --repo "${REPO}" &>/dev/null; then
  echo "    Release ${TAG} 已存在，删除后重建..."
  gh release delete "${TAG}" --repo "${REPO}" --yes 2>/dev/null || true
  git tag -d "${TAG}" 2>/dev/null || true
  git push origin ":refs/tags/${TAG}" 2>/dev/null || true
fi

# 构建附件列表
ASSETS=("${DIST_DIR}/${ZIP_NAME}")
if [ "${CRX_BUILT}" = true ]; then
  ASSETS+=("${DIST_DIR}/${CRX_NAME}")
fi

NOTES="## New API Toolkit ${TAG}

### 安装方式
1. 下载 \`${ZIP_NAME}\` 并解压
2. 打开 \`chrome://extensions/\`，开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择解压后的 \`new-api-toolkit\` 文件夹

> \`.crx\` 文件也可在开发者模式下安装，但推荐使用 ZIP 方式。"

gh release create "${TAG}" \
  --repo "${REPO}" \
  --title "${TAG} — New API Toolkit" \
  --notes "${NOTES}" \
  "${ASSETS[@]}"

echo ""
echo "==> 完成！"
echo "    Release: https://github.com/${REPO}/releases/tag/${TAG}"
echo "    附件: ${ASSETS[*]}"
