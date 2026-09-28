// The platform's own name — the product every workspace runs on — as
// opposed to a workspace's name (Organization.name), which is what tenants
// and their clients see on nearly every page and email. PRODUCT_NAME is
// server-side config; pass it to client components as a prop.
export const PRODUCT_NAME = process.env.PRODUCT_NAME || "HCLM";
