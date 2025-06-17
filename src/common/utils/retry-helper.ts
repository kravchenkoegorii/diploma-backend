export const retryHelper = async <T>(
  func: () => Promise<T>,
  retryCount = 10,
) => {
  let attempts = 0;
  while (attempts < retryCount) {
    try {
      return await func();
    } catch (error) {
      console.log(error);
      attempts++;
    }
  }
};
