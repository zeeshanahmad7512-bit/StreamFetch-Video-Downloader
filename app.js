const $ = id => document.getElementById(id);
const urlInput = $("videoUrl");
const fetchBtn = $("fetchBtn");
const downloadBtn = $("downloadBtn");
const result = $("result");
const message = $("message");
let currentUrl = "";

function setMessage(text, error = false) {
  message.textContent = text;
  message.style.color = error ? "#ff9292" : "#e6c77f";
}
function duration(seconds) {
  if (!seconds) return "Duration unavailable";
  const m = Math.floor(seconds / 60), s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
fetchBtn.addEventListener("click", async () => {
  const url = urlInput.value.trim();
  if (!url) return setMessage("Paste a video URL to get started.", true);
  fetchBtn.disabled = true;
  fetchBtn.querySelector("span").textContent = "Checking...";
  result.hidden = true;
  setMessage("Fetching video details…");
  try {
    const r = await fetch("/api/info", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({url})
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Could not fetch this video.");
    currentUrl = url;
    $("videoTitle").textContent = data.title;
    $("videoMeta").textContent = [data.uploader, duration(data.duration)].filter(Boolean).join(" · ");
    const img = $("thumb");
    if (data.thumbnail) { img.src = data.thumbnail; img.style.visibility = "visible"; }
    else { img.removeAttribute("src"); img.style.visibility = "hidden"; }
    result.hidden = false;
    setMessage("Video details loaded. Choose a format below.");
    $("quality").value = "best";
  } catch (e) { setMessage(e.message, true); }
  finally { fetchBtn.disabled = false; fetchBtn.querySelector("span").textContent = "Fetch video"; }
});
downloadBtn.addEventListener("click", async () => {
  if (!currentUrl) return;
  downloadBtn.disabled = true;
  downloadBtn.innerHTML = "Preparing file… <span>◌</span>";
  setMessage("Preparing your download. Larger videos may take a few minutes.");
  try {
    const r = await fetch("/api/download", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({url: currentUrl, quality: $("quality").value})
    });
    if (!r.ok) {
      let err = {};
      try { err = await r.json(); } catch {}
      throw new Error(err.error || "Download failed.");
    }
    const blob = await r.blob();
    const disposition = r.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="([^"]+)"/);
    const name = match ? match[1] : "streamfetch-video";
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
    setMessage("Your file is ready. Check your browser's downloads.");
  } catch (e) { setMessage(e.message, true); }
  finally { downloadBtn.disabled = false; downloadBtn.innerHTML = 'Download file <span>↓</span>'; }
});
urlInput.addEventListener("keydown", e => { if (e.key === "Enter") fetchBtn.click(); });
$("year").textContent = new Date().getFullYear();
