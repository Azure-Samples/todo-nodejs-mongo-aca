metadata description = 'Creates an Azure Cosmos DB for MongoDB account.'
param name string
param location string = resourceGroup().location
param tags object = {}



module cosmos '../../cosmos/cosmos-account.bicep' = {
  name: 'cosmos-account'
  params: {
    name: name
    location: location

    kind: 'MongoDB'
    tags: tags
  }
}

output endpoint string = cosmos.outputs.endpoint
output id string = cosmos.outputs.id
