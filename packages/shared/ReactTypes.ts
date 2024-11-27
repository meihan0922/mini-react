export type Source = {
  fileName: string;
  lineNumber: number;
};

export type ReactElement = {
  $$typeof: any;
  type: any;
  key: any;
  ref: any;
  props: any;
  // ReactFiber
  _owner?: any;
};

export type ReactNode = ReactElement | ReactText | ReactFragment;
// | ReactPortal
// | ReactProvider<any>
// | ReactConsumer<any>;

export type ReactEmpty = null | void | boolean;

export type ReactFragment = ReactEmpty | Iterable<ReactNode>;

export type ReactNodeList = ReactEmpty | ReactNode;

export type ReactText = string | number;

export type ReactProviderType<T> = {
  $$typeof: symbol | number;
  _context: ReactContext<T>;
};

export type ReactConsumerType<T> = {
  $$typeof: symbol | number;
  type: ReactConsumerType<T>;
  key: null | string;
  ref: null;
  props: {
    children: (value: T) => ReactNodeList;
  };
};

export type ReactContext<T> = {
  $$typeof: symbol | number;
  Consumer: ReactContext<T>;
  Provider: ReactProviderType<T>;
  _currentValue: T; // 默認值
};
