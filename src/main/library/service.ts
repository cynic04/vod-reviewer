import type { Library } from '@shared/domain/schema';
import { createEmptyLibrary, reconcileMatchupFolders, type OperationContext } from './operations';
import type { LibraryRepository } from './repository';

/**
 * Owns the in-memory library and is the only writer of the library file.
 *
 * Mutations are queued so they run one at a time, and a change only becomes the
 * current state after it has been written to disk successfully.
 */
export class LibraryService {
  readonly #repository: LibraryRepository;
  readonly context: OperationContext;
  #library: Library;
  #queue: Promise<unknown> = Promise.resolve();

  private constructor(repository: LibraryRepository, context: OperationContext, library: Library) {
    this.#repository = repository;
    this.context = context;
    this.#library = library;
  }

  static async open(repository: LibraryRepository, context: OperationContext): Promise<LibraryService> {
    const stored = await repository.load();
    const library = reconcileMatchupFolders(stored ?? createEmptyLibrary(context), context);
    if (library !== stored) await repository.save(library);
    return new LibraryService(repository, context, library);
  }

  get library(): Library {
    return this.#library;
  }

  /** Applies a pure operation and persists the outcome. Rejects, leaving state untouched, if either fails. */
  mutate<R>(operation: (library: Library) => { library: Library; result: R }): Promise<R> {
    const run = this.#queue.then(async () => {
      const { library, result } = operation(this.#library);
      if (library !== this.#library) {
        await this.#repository.save(library);
        this.#library = library;
      }
      return result;
    });
    this.#queue = run.catch(() => undefined);
    return run;
  }

  /** Shorthand for operations whose only result is the new library. */
  update(operation: (library: Library) => Library): Promise<Library> {
    return this.mutate((current) => {
      const library = operation(current);
      return { library, result: library };
    });
  }
}
