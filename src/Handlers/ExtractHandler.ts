import path from 'path';
import fs from 'fs-extra';
import fg from 'fast-glob';
import { injectable, inject } from 'inversify';
import {
  ApplierOptionsContract,
  Binding,
  Bus,
  color,
  Contextualized,
  contextualizeValue,
  ExecutionError,
  Extract,
  HandlerContract,
  Name,
  PromptContract,
} from '@/exports';

@injectable()
export class ExtractHandler implements HandlerContract {
  public name = Name.Handler.Extract;

  @inject(Binding.Bus)
  protected bus!: Bus;

  @inject(Binding.Prompt)
  protected prompt!: PromptContract;

  protected action!: Contextualized<Extract>;
  protected applierOptions!: ApplierOptionsContract;

  async handle(action: Contextualized<Extract>, applierOptions: ApplierOptionsContract): Promise<void> {
    if (!Array.isArray(action.input)) {
      action.input = [action.input];
    }

    this.action = action;
    this.applierOptions = applierOptions;

    for (const relativeTemplateOrGlob of action.input) {
      await this.extract(relativeTemplateOrGlob, action.target);
    }
  }

  /**
   * Extracts the given input to the given relative target.
   */
  protected async extract(relativeTemplateOrGlob: string, relativeTarget: string): Promise<void> {
    const templateBase = path.join(
      this.action.preset.presetDirectory,
      contextualizeValue(this.action.preset, this.action.preset.templateDirectory),
    );
    const templatePath = path.join(templateBase, relativeTemplateOrGlob);
    const targetBase = this.applierOptions.target;
    const targetPath = path.join(targetBase, relativeTarget);

    // If the input is a directory but the target is a file,
    // we cannot perform a copy.
    if (this.isDirectory(templatePath) && this.isFile(targetPath)) {
      throw new ExecutionError() //
        .withMessage('A directory can not be extracted to a file.')
        .stopsExecution();
    }

    // If both the input and target are files, we can call the
    // copyFile method on them.
    if (this.isFile(templatePath) && this.isFile(targetPath)) {
      await this.copyFile(templatePath, targetPath);
      return;
    }

    // If the input is a file, we assume the target is a directory.
    if (this.isFile(templatePath)) {
      await this.copyFile(templatePath, path.join(targetPath, this.renameDotFile(relativeTemplateOrGlob)));
      return;
    }

    // If the input is a directory, we assume that the target is as well.
    if (this.isDirectory(templatePath)) {
      await this.extractDirectory(relativeTemplateOrGlob, relativeTarget);
      return;
    }

    // Lastly, assume the relative template is a glob.
    await this.extractDirectory('', relativeTarget, relativeTemplateOrGlob);
  }

  /**
   * Extracts the files in the given directory to the given target-relative directory.
   */
  protected async extractDirectory(relativeInputDirectory: string, relativeTargetDirectory: string, glob?: string): Promise<void> {
    this.bus.debug(
      `Extracting templates in ${color.magenta(`/${relativeInputDirectory}`)} to ${color.magenta(`/${relativeTargetDirectory}`)}.`,
    );

    const entries = await fg(glob ?? '**/**', {
      dot: this.action.shouldExtractDotfiles,
      cwd: path.join(
        this.action.preset.presetDirectory,
        contextualizeValue(this.action.preset, this.action.preset.templateDirectory),
        relativeInputDirectory,
      ),
    });

    this.bus.debug(`Found ${color.magenta(entries.length.toString())} entries.`);

    for (const relativeFilePath of entries) {
      const targetDirectory = path.join(this.applierOptions.target, relativeTargetDirectory);
      fs.ensureDirSync(targetDirectory);

      await this.extractTemplateFile(relativeFilePath, relativeInputDirectory, targetDirectory);
    }
  }

  /**
   * Copies the given relative file to the given target directory.
   */
  protected async extractTemplateFile(relativeFilePath: string, relativeInputDirectory: string, targetDirectory: string): Promise<void> {
    const targetFile = path.join(targetDirectory, this.renameDotFile(relativeFilePath));
    const inputFile = path.join(
      this.action.preset.presetDirectory,
      contextualizeValue(this.action.preset, this.action.preset.templateDirectory),
      relativeInputDirectory,
      relativeFilePath,
    );

    await this.copyFile(inputFile, targetFile);
  }

  /**
   * Copies the input file to the target file. Both are absolute paths.
   */
  protected async copyFile(inputFile: string, targetFile: string): Promise<void> {
    if (fs.pathExistsSync(targetFile)) {
      // If the preset is not interactive, log
      if (this.action.strategy === 'ask' && !this.action.preset.isInteractive()) {
        this.bus.debug(`Silently overriding ${color.magenta(targetFile)} since interactions are disabled.`);
      }

      // Ask, but only if interactions are not specifically disabled
      if (this.action.strategy === 'ask' && this.action.preset.isInteractive()) {
        const shouldReplace = await this.prompt.confirm(`${color.magenta(targetFile)} already exists. Replace it?`, {
          default: true,
        });

        if (!shouldReplace) {
          this.bus.debug(`User chose not to replace ${color.magenta(targetFile)}.`);
          return;
        }
      }

      // Skip
      if (this.action.strategy === 'skip') {
        this.bus.debug(`Skipping copy to ${color.magenta(targetFile)}.`);
        return;
      }

      // Override
      this.bus.debug(`Overriding ${color.magenta(targetFile)}.`);
    }

    this.bus.debug(`Copying ${color.magenta(inputFile)} to ${color.magenta(targetFile)}.`);
    fs.copySync(inputFile, targetFile);
  }

  /**
   * Renames a file.dotfile file into .file.
   */
  protected renameDotFile(input: string): string {
    if (input.endsWith('.dotfile')) {
      // Input is a relative path, so the dot has to be added before the last slash.
      return input.includes('/')
        ? input.replace(/(.+\/)(.+).dotfile$/, (_, slash, file) => `${slash ?? ''}.${file}`)
        : input.replace(/^(.+)\.dotfile$/, (_, file) => `.${file}`);
    }

    return input;
  }

  /**
   * Checks if the input is a file.
   */
  protected isFile(input: string): boolean {
    return fs.existsSync(input) && fs.statSync(input).isFile();
  }

  /**
   * Checks if the input is a directory.
   */
  protected isDirectory(input: string): boolean {
    return fs.existsSync(input) && fs.statSync(input).isDirectory();
  }
}
