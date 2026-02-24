export enum EnumSecretsNameKey {
  JwtSecretKey = "JwtSecretKey",
  // MQTT Authentication Secrets
  MqttUsername = "MqttUsername",
  MqttPassword = "MqttPassword",
  MqttClientCertificate = "MqttClientCertificate",
  MqttClientPrivateKey = "MqttClientPrivateKey",
  MqttCaCertificate = "MqttCaCertificate",
  // Broker-specific secrets (can be suffixed with broker ID)
  MqttBrokerUsername = "MqttBrokerUsername",
  MqttBrokerPassword = "MqttBrokerPassword",
  MqttBrokerClientCert = "MqttBrokerClientCert",
  MqttBrokerClientKey = "MqttBrokerClientKey",
  MqttBrokerCaCert = "MqttBrokerCaCert",
}
