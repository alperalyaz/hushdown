chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== "image-to-dataurl") return false;

  const img = new Image();
  img.onload = () => {
    const sw = img.naturalWidth;
    const sh = img.naturalHeight;
    const canvas = document.getElementById("c");
    const ctx = canvas.getContext("2d");

    function drawContainWithBlurredBg(cw, ch, blurPx, brightness) {
      canvas.width = cw;
      canvas.height = ch;
      ctx.clearRect(0, 0, cw, ch);

      const coverScale = Math.max(cw / sw, ch / sh);
      const bw = Math.round(sw * coverScale);
      const bh = Math.round(sh * coverScale);
      const bx = Math.round((cw - bw) / 2);
      const by = Math.round((ch - bh) / 2);
      ctx.filter = `blur(${blurPx}px) brightness(${brightness})`;
      ctx.drawImage(img, bx, by, bw, bh);
      ctx.filter = "none";

      const containScale = Math.min(cw / sw, ch / sh);
      const dw = Math.round(sw * containScale);
      const dh = Math.round(sh * containScale);
      const dx = Math.round((cw - dw) / 2);
      const dy = Math.round((ch - dh) / 2);
      ctx.drawImage(img, dx, dy, dw, dh);
    }

    try {
      // Large notification image
      drawContainWithBlurredBg(448, 252, 18, 0.55);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.88);

      // Small thumbnail for popup list
      drawContainWithBlurredBg(56, 56, 6, 0.5);
      const thumbUrl = canvas.toDataURL("image/jpeg", 0.72);

      sendResponse({ dataUrl, thumbUrl, width: sw, height: sh });
    } catch (e) {
      sendResponse({ error: e.message });
    }
  };
  img.onerror = () => {
    sendResponse({ error: "load failed" });
  };
  img.src = msg.fileUrl;
  return true;
});
