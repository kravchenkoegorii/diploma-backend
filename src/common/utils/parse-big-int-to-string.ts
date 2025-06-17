export const parseBigIntToString = (data: any) => {
  if (typeof data === 'bigint') {
    return data.toString();
  }

  if (Array.isArray(data)) {
    return data.map((item) => parseBigIntToString(item));
  }

  if (data && typeof data === 'object') {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = parseBigIntToString(value);
    }
    return result;
  }

  return data;
};
