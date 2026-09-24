const ERROR_CORRECTION_LEVEL = "M";
const DISPLAY_TARGET_PX = 640;
const DOWNLOAD_TARGET_PX = 1600;
const QUIET_ZONE_MODULES = 4;

const form = document.querySelector("#encode-form");
const textField = document.querySelector("#qr-text");
const errorMessage = document.querySelector("#error-message");
const resultSection = document.querySelector("#qr-result");
const displayCanvas = document.querySelector("#qr-canvas");
const downloadButton = document.querySelector("#download-button");

let currentQrCode = null;

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
}

function clearError() {
  errorMessage.hidden = true;
  errorMessage.textContent = "";
}

function drawQrCode(qrCode, canvas, targetPx) {
  const moduleCount = qrCode.getModuleCount();
  const cellSize = Math.max(1, Math.round(targetPx / (moduleCount + QUIET_ZONE_MODULES * 2)));
  const margin = cellSize * QUIET_ZONE_MODULES;
  const size = moduleCount * cellSize + margin * 2;

  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size, size);
  context.fillStyle = "#000000";

  for (let row = 0; row < moduleCount; row += 1) {
    for (let col = 0; col < moduleCount; col += 1) {
      if (qrCode.isDark(row, col)) {
        context.fillRect(margin + col * cellSize, margin + row * cellSize, cellSize, cellSize);
      }
    }
  }
}

function encodeText(text) {
  const qrCode = qrcode(0, ERROR_CORRECTION_LEVEL);
  qrCode.addData(text);
  qrCode.make();
  return qrCode;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  clearError();

  const text = textField.value.trim();
  if (!text) {
    showError("Enter some text to encode.");
    resultSection.hidden = true;
    currentQrCode = null;
    return;
  }

  let qrCode;
  try {
    qrCode = encodeText(text);
  } catch (error) {
    showError("That text is too long to fit in a QR code. Try shortening it.");
    resultSection.hidden = true;
    currentQrCode = null;
    return;
  }

  currentQrCode = qrCode;
  drawQrCode(qrCode, displayCanvas, DISPLAY_TARGET_PX);
  resultSection.hidden = false;
});

downloadButton.addEventListener("click", () => {
  if (!currentQrCode) return;

  const canvas = document.createElement("canvas");
  drawQrCode(currentQrCode, canvas, DOWNLOAD_TARGET_PX);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "qr-code.png";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, "image/png");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js");
  });
}
