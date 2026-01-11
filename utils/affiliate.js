export function toAffiliateLink(url, tag) {
  return url.includes("?")
    ? `${url}&tag=${tag}`
    : `${url}?tag=${tag}`;
}
