import { AppConfig, DatabaseConfig, ObservabilityConfig } from "./appConfig";
import { AppConfigurationClient, ConfigurationSetting } from "@azure/app-configuration";
import dotenv from "dotenv";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { logger } from "../config/observability";
import { IConfig } from "config";

export const getConfig: () => Promise<AppConfig> = async () => {
    logger.info(`Loading configuration from ${process.env.NODE_ENV} environment...`);
    if (process.env.NODE_ENV == "production") {
        // Load any ENV vars from Azure App Configuration
        await populateEnvironmentFromAppConfig();
    }
    else {
        // Load any ENV vars from local src/api/.env file
        // Prepare AZURE_COSMOS_API2COSMOS_CONNECTIONSTRING, AZURE_APPINSIGHTS_CONNECTIONSTRING for local development run
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
    const azureAppConfigEndpoint = process.env.AZURE_APPCONFIGURATION_ENDPOINT || "";

    if (!azureAppConfigEndpoint) {
        logger.warn("AZURE_APPCONFIGURATION_ENDPOINT has not been set. Configuration will be loaded from current environment.");
        return;
    }

    try {
        logger.info("Populating environment from Azure AppConfiguration...");
        const credential = new DefaultAzureCredential({
            managedIdentityClientId: clientId
        });

        const appConfigClient = new AppConfigurationClient(azureAppConfigEndpoint, credential);

        const settings = appConfigClient.listConfigurationSettings();
        for await (const setting of settings) {
            if (setting.value && isKeyVaultReference(setting)) {
                const secretValue = await getSecretFromKeyVault(setting, credential);
                process.env[setting.key] = secretValue;
            } else if (setting.value) {
                process.env[setting.key] = setting.value;
            }
        }
    }
    catch (err: any) {
        logger.error(`Error authenticating with Azure App Configuration or Keyvault. Ensure your managed identity or service principal has GET/LIST permissions. Error: ${err}`);
        throw err;
    }
};

const isKeyVaultReference = (setting: ConfigurationSetting) => {
    if (!setting.value) {
        return false;
    }
    // Check if the setting value is a JSON string that contains a "uri" property
    try {
        const valueObject = JSON.parse(setting.value);
        return valueObject && typeof valueObject.uri === "string";
    } catch {
        return false;
    }
};

const getSecretFromKeyVault = async (setting: ConfigurationSetting, credential: DefaultAzureCredential) => {
    if (!setting.value) {
        throw new Error(`AppConfiguration setting ${setting.key} does not have a value`);
    }

    // Parse the setting value as JSON and extract the secretUri
    const secretUriObject = JSON.parse(setting.value);
    const secretUri = secretUriObject.uri;

    if (!secretUri) {
        throw new Error(`AppConfiguration setting ${setting.key} does not contain a valid Key Vault reference`);
    }

    // Extract the Key Vault name and secret name from the secretUri
    const secretUriParts = secretUri.split("/");
    const keyVaultName = secretUriParts[2];
    const secretName = secretUriParts[4];

    // Create a new SecretClient
    const endpointUrl = `https://${keyVaultName}`;
    const secretClient = new SecretClient(endpointUrl, credential);

    // Get the secret
    const secret = await secretClient.getSecret(secretName);

    return secret.value;
};