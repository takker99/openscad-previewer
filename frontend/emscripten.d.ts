// 最低限の Emscripten Module 型

interface FSWriteOptions {
  encoding?: string;
}

interface FSReadOptions {
  encoding?: string;
}

export type EmscriptenFS = {
  writeFile(
    path: string,
    data: string | Uint8Array,
    opts?: FSWriteOptions,
  ): void;
  readFile(path: string, opts?: FSReadOptions): Uint8Array;
  mkdir(path: string): void;
  unlink(path: string): void;
  readdir(path: string): string[];
  stat(path: string): { size: number };
};

export type EmscriptenModule = {
  FS: EmscriptenFS;
  callMain: (args: string[]) => number;
  // stdout/stderr capture
  print?: (...args: string[]) => void;
  printErr?: (...args: string[]) => void;
  // optional pre/post
  preRun?: Array<() => void>;
  postRun?: Array<() => void>;
};

export type OpenSCADModuleFactory = (
  overrides?: Partial<EmscriptenModule>,
) => Promise<EmscriptenModule>;
