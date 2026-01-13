export function norm(s) {
  if (!s) return "";
  return String(s)
    .replace(/\u00A0/g, " ")
    .trim();
}

export function normalizePriceNumber(s) {
  if (!s) return null;
  let t = String(s)
    .replace(/\u00A0/g, " ")
    .trim();
  t = t.replace(/[^0-9.,\s]/g, "");
  if (/\d+\.\d{3},\d{2}/.test(t)) {
    t = t.replace(/\./g, "").replace(/,/g, ".");
  } else if (/\d+,\d{1,2}$/.test(t) && !t.includes(".")) {
    t = t.replace(/,/g, ".");
  } else {
    t = t.replace(/,/g, "");
  }
  const num = parseFloat(t);
  return Number.isFinite(num) ? num : null;
}

export function computeDiscount(oldNum, currentNum) {
  if (!oldNum || !currentNum || oldNum <= currentNum) return null;
  return Math.round(((oldNum - currentNum) / oldNum) * 100) + "%";
}

export function pickBestTitle({ imgAlt, linkTitle, h2Span, h2Text }) {
  const candidates = [imgAlt, linkTitle, h2Span, h2Text]
    .map((s) => (s ? String(s).trim() : ""))
    .filter(Boolean);
  for (const c of candidates) {
    if (!/^\d+%/.test(c)) return c;
  }
  return candidates[0] || null;
}

export function addAffiliateTag(rawUrl, tag) {
  if (!rawUrl || !tag) return rawUrl;

  try {
    // إضافة base إذا الرابط نسبي
    const u = rawUrl.startsWith("http")
      ? new URL(rawUrl)
      : new URL(rawUrl, "https://www.amazon.de");

    // إذا tag موجود ومطابق، لا تغير
    if (u.searchParams.get("tag") === tag) return u.toString();

    // إضافة أو تعديل tag
    u.searchParams.set("tag", tag);
    u.searchParams.set("linkCode", "ll1");

    return u.toString();
  } catch (e) {
    // إذا كان الرابط غير صالح، إرجاعه كما هو
    return rawUrl;
  }
}

