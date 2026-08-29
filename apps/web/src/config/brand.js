// Change this file and replace public/brand-logo.svg to rebrand a deployment.

export const brand = Object.freeze({
  name: "UygiDrive",
  tagline: "Simpliest access to your files.",
  description: "A boutique place to store and share your files.",
  marketingDescription: "A boutique place to store and share your files.",
  logoPath: "/brand-logo.svg",
  namespace: "uygidrive",
});

export function brandTitle(title) {
  return title ? `${title} | ${brand.name}` : brand.name;
}
