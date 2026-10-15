import { Plugin } from "@nestjs/apollo";
import { ApolloServerPlugin, GraphQLRequestListener } from "@apollo/server";
import { SchemaVersionService } from "../schemaVersion/schemaVersion.service";

@Plugin()
export class SchemaVersionPlugin implements ApolloServerPlugin {
  constructor(private readonly schemaVersionService: SchemaVersionService) {}

  async requestDidStart(): Promise<GraphQLRequestListener<any>> {
    return {
      willSendResponse: async (requestContext) => {
        try {
          const schemaVersion = await this.schemaVersionService.getVersion();

          if (schemaVersion && requestContext.response.http) {
            requestContext.response.http.headers.set(
              "X-Schema-Version",
              schemaVersion
            );
          }
        } catch (error) {
          // Log error but don't fail the request
          console.warn("Failed to set X-Schema-Version header:", error);
        }
      },
    };
  }
}
