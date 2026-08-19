import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@core": path.resolve(__dirname, "src/core"),
      "@render": path.resolve(__dirname, "src/render"),
      "@data": path.resolve(__dirname, "src/data"),
      "@ui": path.resolve(__dirname, "src/ui")
    }
  },
  test: {
    environment: "node"
  }
});
