export const columnNumericTransformer = {
  to: (value: number): number => value,
  from: (value: string): number => parseFloat(value),
};
