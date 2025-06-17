import {
  ClientOptions,
  createClient,
  OperationContext,
  TypedDocumentNode,
} from '@urql/core';

export const createSubgraphClient = (opts: ClientOptions) => {
  const client = createClient(opts);

  return async <
    Data,
    Variables extends Record<string, unknown> = Record<string, unknown>,
  >(
    document: TypedDocumentNode<Data, Variables>,
    params: Variables,
    context?: Partial<OperationContext>,
  ): Promise<Data> => {
    const result = await client.query(document, params, context).toPromise();

    if (result.error) {
      throw new Error(result.error.message);
    }

    if (!result.data) {
      throw new Error('No data received');
    }

    return result.data;
  };
};
