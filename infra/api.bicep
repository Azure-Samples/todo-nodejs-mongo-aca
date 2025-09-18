@minLength(1)
@maxLength(64)
@description('Name of the the environment which is used to generate a short unique hash used in all resources.')
param environmentName string

@minLength(1)
@description('Primary location for all resources')
param location string

param containerAppsEnvironmentName string
param containerRegistryName string

param imageName string

param identityId string
param identityClientId string
param applicationInsightsConnectionString string
param cosmosEndpoint string
param cosmosDatabaseName string
param keyVaultEndpoint string
param webUrl string

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-01-01-preview' existing = {
  name: containerRegistryName
}

resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2022-03-01' existing = {
  name: containerAppsEnvironmentName
}

module api 'br/public:avm/res/app/container-app:0.8.0' = {
  name: 'api'
  params: {
    name: 'api'
    ingressTargetPort: 3100
    corsPolicy: {
      allowedOrigins: [
        webUrl
      ]
      allowedMethods: [
        '*'
      ]
    }
    scaleMinReplicas: 1
    scaleMaxReplicas: 10
    secrets: {
      secureList:  [
      ]
    }
    containers: [
      {
        image: imageName
        name: 'main'
        resources: {
          cpu: json('0.5')
          memory: '1.0Gi'
        }
        env: [
          {
            name: 'API_ALLOW_ORIGINS'
            value: webUrl
          }
          {
            name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
            value: applicationInsightsConnectionString
          }
          {
            name: 'AZURE_CLIENT_ID'
            value: identityClientId
          }
          {
            name: 'AZURE_KEY_VAULT_ENDPOINT'
            value: keyVaultEndpoint
          }
          {
            name: 'AZURE_COSMOS_ENDPOINT'
            value: cosmosEndpoint
          }
          {
            name: 'AZURE_COSMOS_DATABASE_NAME'
            value: cosmosDatabaseName
          }
        ]
      }
    ]
    managedIdentities:{
      systemAssigned: false
      userAssignedResourceIds: [identityId]
    }
    registries:[
      {
        server: containerRegistry.properties.loginServer
        identity: identityId
      }
    ]
    environmentResourceId: containerAppsEnvironment.id
    location: location
    tags: {'azd-env-name': environmentName, 'azd-service-name': 'api'}
  }
}

