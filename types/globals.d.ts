// Ambient type declarations shared across the project.

declare module "*.css";
declare module "*.css?url";
declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}
declare module "*.svg" {
  const content: string;
  export default content;
}
