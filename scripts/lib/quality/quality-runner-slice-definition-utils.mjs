export function defineSlice(definition) {
  return Object.freeze({
    ...definition,
    inputs: Object.freeze(definition.inputs ?? []),
  });
}
