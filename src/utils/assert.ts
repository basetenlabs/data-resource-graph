export default function assert(
  value: unknown,
  message: string | Error = 'failed assertion',
): asserts value {
  if (!value) {
    throw message instanceof Error ? message : new Error();
  }
}
