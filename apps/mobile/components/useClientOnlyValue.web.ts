import { useEffect, useState } from 'react';

// `useEffect` is not invoked during server rendering, meaning
// we can use this to determine if we're on the server or not.
export function useClientOnlyValue<S, C>(server: S, client: C): S | C {
  const [value, setValue] = useState<S | C>(server);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR→클라이언트 하이드레이션 전환용 의도된 패턴 (Expo 템플릿)
    setValue(client);
  }, [client]);

  return value;
}
