import 'reflect-metadata';
import { Container } from 'inversify';
import {
  ApplierContract,
  ResolverContract,
  ResolversContract,
  ParserContract,
  ImporterContract,
  ActionHandlerContract,
} from '@/Contracts';
import { PresetResolver, LocalResolver, GithubGistResolver, GithubResolver } from '@/Resolvers';
import { PresetApplier } from '@/Appliers';
import { GeneratorParser } from '@/Parsers';
import { EvalImporter } from '@/Importers';
import { Binding, Name } from './Binding';
import { CopyActionHandler, DeleteActionHandler, PromptActionHandler, CustomActionHandler } from '@/Handlers';
import { GitResolver } from '@/Resolvers/GitResolver';

/**
 * The application container.
 */
const container = new Container();

// Appliers
container.bind<ApplierContract>(Binding.Applier).to(PresetApplier);

// Parsers
container.bind<ParserContract>(Binding.Parser).to(GeneratorParser);

// Importers
container.bind<ImporterContract>(Binding.Importer).to(EvalImporter);

/*
|--------------------------------------------------------------------------
| Resolvers
|--------------------------------------------------------------------------
*/

// Binds resolvers
container.bind<ResolverContract>(Binding.Resolver).to(LocalResolver).whenTargetNamed(Name.LocalResolver);
container.bind<ResolverContract>(Binding.Resolver).to(GithubGistResolver).whenTargetNamed(Name.GithubGistResolver);
container.bind<ResolverContract>(Binding.Resolver).to(GithubResolver).whenTargetNamed(Name.GithubResolver);
container.bind<ResolverContract>(Binding.Resolver).to(GitResolver).whenTargetNamed(Name.GitResolver);

// Sets the preset resolver as the default resolver to be matched
container.bind<ResolverContract>(Binding.Resolver).to(PresetResolver).whenTargetIsDefault();

// Binds the list of resolvers
container.bind<ResolversContract>(Binding.Resolvers).toDynamicValue(() => {
  return [Name.LocalResolver, Name.GithubGistResolver, Name.GithubResolver, Name.GitResolver].map(name =>
    container.getNamed<ResolverContract>(Binding.Resolver, name)
  );
});

/*
|--------------------------------------------------------------------------
| Handlers
|--------------------------------------------------------------------------
*/

// Bind handlers
container.bind<ActionHandlerContract<'copy'>>(Binding.Handler).to(CopyActionHandler).whenTargetNamed(Name.CopyHandler);
container
  .bind<ActionHandlerContract<'delete'>>(Binding.Handler)
  .to(DeleteActionHandler)
  .whenTargetNamed(Name.DeleteHandler);
container
  .bind<ActionHandlerContract<'prompt'>>(Binding.Handler)
  .to(PromptActionHandler)
  .whenTargetNamed(Name.PromptHandler);
container
  .bind<ActionHandlerContract<'custom'>>(Binding.Handler)
  .to(CustomActionHandler)
  .whenTargetNamed(Name.CustomHandler);

export { container };
