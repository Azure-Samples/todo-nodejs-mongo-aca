import { AppConfig, DatabaseConfig, ObservabilityConfig } from "./appConfig";
import { load } from "@azure/app-configuration-provider";
import dotenv from "dotenv";
import { getDefaultAzureCredential } from "@azure/identity";
import { logger } from "../config/observability";
import { IConfig } from "config";

export const getConfig: () => Promise<AppConfig> = async () => {
    logger.info(`Loading configuration from ${process.env.NODE_ENV} environment...`);
    if (process.env.NODE_ENV == "production") {
        // Load any ENV vars from Azure App Configuration
        await populateEnvironmentFromAppConfig();
    }
    else {
        // For local dev/debug, load any ENV vars from local src/api/.env file
        // Prepare AZURE_COSMOS_API2COSMOS_CONNECTIONSTRING, AZURE_APPINSIGHTS_CONNECTIONSTRING
        dotenv.config();
    }
    
    // Load configuration after population is complete
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const config: IConfig = require("config") as IConfig;
    const databaseConfig = config.get<DatabaseConfig>("database");
    const observabilityConfig = config.get<ObservabilityConfig>("observability");

    if (!databaseConfig.connectionString) {
        logger.warn("database.connectionString is required but has not been set. Ensure environment variable 'AZURE_COSMOS_CONNECTION_STRING' has been set");
    }

    if (!observabilityConfig.connectionString) {
        logger.warn("observability.connectionString is required but has not been set. Ensure environment variable 'APPLICATIONINSIGHTS_CONNECTION_STRING' has been set");
    }

    return {
        observability: {
            connectionString: observabilityConfig.connectionString,
            roleName: observabilityConfig.roleName,
        },
        database: {
            connectionString: databaseConfig.connectionString,
            databaseName: databaseConfig.databaseName,
        },
    };
};

const populateEnvironmentFromAppConfig = async () => {
    // If Azure AppConfig endpoint is defined
    // 1. Login with Default credential (managed identity or service principal)
    // 2. Overlay App Config configurations on top of ENV vars (Read from KeyVault secret if is KeyVault references)
    const clientId = process.env.AZURE_CLIENT_ID;
    const endpoint = process.env.AZURE_APPCONFIGURATION_ENDPOINT || "";

    if (!endpoint) {
        logger.warn("AZURE_APPCONFIGURATION_ENDPOINT has not been set. Configuration will be loaded from current environment.");
        return;
    }

    try {
        logger.info("Populating environment from Azure AppConfiguration...");
        const credential = getDefaultAzureCredential();

        const settings = await load(endpoint, credential, {
            keyVaultOptions: {
                // Access keyvault using the same idenity, make sure the permission is set correctly.
                credential: credential
            }
        });

        for (const [key, value] of settings) {
            logger.info(`Setting read from app config ${key}=${value}`);
            process.env[key] = value;
        }
    }
    catch (err: any) {
        logger.error(`Error authenticating with Azure App Configuration or Keyvault. Ensure your managed identity or service principal has GET/LIST permissions. Error: ${err}`);
        throw err;
    }
};