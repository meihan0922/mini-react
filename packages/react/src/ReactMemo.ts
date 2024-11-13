import { REACT_MEMO_TYPE } from "@mono/shared/ReactSymbols";

export function memo<Props>(
  type: any,
  compare?: (oldProps: Props, newProps: Props) => boolean
) {
  const elementType = {
    $$typeof: REACT_MEMO_TYPE,
    type, //組件
    compare: compare === undefined ? null : compare,
  };

  return elementType;
}
