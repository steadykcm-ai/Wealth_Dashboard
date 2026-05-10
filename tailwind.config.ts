import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: "#3d47cf",
        sidebar: "#1a2332",
        profit: "#4caf50",
        loss: "#f44336",
        "bg-light": "#f8f9fc",
        "bg-dark": "#0f1923",
      },
    },
  },
  plugins: [],
};

export default config;
