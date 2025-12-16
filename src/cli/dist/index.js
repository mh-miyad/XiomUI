#!/usr/bin/env node

// src/index.ts
import { Command } from "commander";

// src/commands/add.ts
import axios from "axios";
import chalk from "chalk";
import { execa } from "execa";
import fs from "fs-extra";
import ora from "ora";
import path from "path";
import prompts from "prompts";
var REGISTRY_URL = process.env.REGISTRY_URL || "https://xiom-ui.vercel.app/api/registry";
async function add(components, options) {
  const configPath = path.resolve("xiom-ui.json");
  if (!await fs.pathExists(configPath)) {
    console.log(
      chalk.red("\n\u274C Config not found. Run `npx xiom-ui init` first.\n")
    );
    process.exit(1);
  }
  const config = await fs.readJSON(configPath);
  if (options.all) {
    const { data: registry } = await axios.get(REGISTRY_URL);
    components = registry.components.map((c) => c.name);
  }
  if (!components.length) {
    const { data: registry } = await axios.get(REGISTRY_URL);
    const { selectedComponents } = await prompts({
      type: "multiselect",
      name: "selectedComponents",
      message: "Which components would you like to add?",
      choices: registry.components.map((c) => ({
        title: c.name,
        value: c.name,
        description: c.description
      })),
      hint: "Space to select, Enter to confirm"
    });
    components = selectedComponents;
  }
  if (!components.length) {
    console.log(chalk.yellow("\nNo components selected.\n"));
    return;
  }
  console.log("");
  const allDependencies = /* @__PURE__ */ new Set();
  const allDevDependencies = /* @__PURE__ */ new Set();
  for (const componentName of components) {
    const spinner = ora(`Fetching ${componentName}...`).start();
    try {
      const { data: component } = await axios.get(
        `${REGISTRY_URL}/${componentName}`
      );
      if (component.registryDependencies?.length) {
        spinner.text = `Installing dependencies for ${componentName}...`;
        await add(component.registryDependencies, {
          yes: true,
          overwrite: options.overwrite
        });
      }
      component.dependencies?.forEach((dep) => allDependencies.add(dep));
      component.devDependencies?.forEach((dep) => allDevDependencies.add(dep));
      for (const file of component.files) {
        const targetPath = path.join(config.aliases.components, file.name);
        if (await fs.pathExists(targetPath)) {
          if (!options.overwrite && !options.yes) {
            const { overwrite } = await prompts({
              type: "confirm",
              name: "overwrite",
              message: `${file.name} already exists. Overwrite?`,
              initial: false
            });
            if (!overwrite) {
              spinner.info(chalk.yellow(`Skipped ${file.name}`));
              continue;
            }
          }
        }
        let content = file.content;
        content = content.replace(
          /@\/lib\/utils/g,
          config.aliases.utils.replace(/^src\//, "@/")
        );
        await fs.ensureDir(path.dirname(targetPath));
        await fs.writeFile(targetPath, content);
      }
      spinner.succeed(chalk.green(`Added ${componentName}`));
    } catch (error) {
      if (error.response?.status === 404) {
        spinner.fail(chalk.red(`Component "${componentName}" not found`));
      } else {
        spinner.fail(chalk.red(`Failed to add ${componentName}`));
        console.error(chalk.dim(error.message));
      }
    }
  }
  if (allDependencies.size > 0) {
    const depsSpinner = ora("Installing dependencies...").start();
    try {
      await execa("npm", ["install", ...allDependencies]);
      depsSpinner.succeed(chalk.green("Dependencies installed"));
    } catch {
      depsSpinner.fail(chalk.red("Failed to install some dependencies"));
    }
  }
  if (allDevDependencies.size > 0) {
    try {
      await execa("npm", ["install", "-D", ...allDevDependencies]);
    } catch {
    }
  }
  console.log(chalk.dim("\n\u2728 Done!\n"));
}

// src/commands/init.ts
import chalk2 from "chalk";
import { execa as execa2 } from "execa";
import fs2 from "fs-extra";
import ora2 from "ora";
import path2 from "path";
import prompts2 from "prompts";
async function init() {
  console.log(chalk2.bold("\n\u26A1 Welcome to xiom-ui!\n"));
  const response = await prompts2([
    {
      type: "text",
      name: "componentsDir",
      message: "Where would you like to install components?",
      initial: "src/components/ui"
    },
    {
      type: "text",
      name: "utilsPath",
      message: "Where is your utils file? (we'll create cn helper)",
      initial: "src/lib/utils.ts"
    },
    {
      type: "select",
      name: "style",
      message: "Which style would you like to use?",
      choices: [
        { title: "Default", value: "default" },
        { title: "New York", value: "new-york" }
      ]
    },
    {
      type: "text",
      name: "tailwindCss",
      message: "Where is your global CSS file?",
      initial: "src/app/globals.css"
    }
  ]);
  const config = {
    $schema: "https://xiom-ui.dev/schema.json",
    style: response.style,
    tailwind: {
      css: response.tailwindCss
    },
    aliases: {
      components: response.componentsDir,
      utils: response.utilsPath.replace(/\.ts$/, "")
    }
  };
  const spinner = ora2("Initializing project...").start();
  try {
    await fs2.writeJSON("xiom-ui.json", config, { spaces: 2 });
    await fs2.ensureDir(path2.dirname(response.utilsPath));
    const utilsContent = `import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
`;
    await fs2.writeFile(response.utilsPath, utilsContent);
    await fs2.ensureDir(response.componentsDir);
    spinner.text = "Installing dependencies...";
    await execa2("npm", [
      "install",
      "clsx",
      "tailwind-merge",
      "class-variance-authority"
    ]);
    spinner.succeed(chalk2.green("Project initialized successfully!"));
    console.log(chalk2.dim("\nNext steps:"));
    console.log(chalk2.cyan("  npx xiom-ui add button"));
    console.log(chalk2.cyan("  npx xiom-ui add card input\n"));
  } catch (error) {
    spinner.fail(chalk2.red("Failed to initialize project"));
    console.error(error);
    process.exit(1);
  }
}

// src/index.ts
var program = new Command();
program.name("xiom-ui").description("Add beautiful UI components to your project").version("0.1.0");
program.command("init").description("Initialize your project and install dependencies").action(init);
program.command("add").description("Add components to your project").argument("[components...]", "Components to add").option("-y, --yes", "Skip confirmation prompt").option("-o, --overwrite", "Overwrite existing files").option("-a, --all", "Add all available components").action(add);
program.parse();
