variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "ai-knowledge-assistant"
}

variable "db_host" {
  description = "PostgreSQL host"
  type        = string
  default     = "localhost"
}

variable "db_port" {
  description = "PostgreSQL port"
  type        = string
  default     = "5433"
}

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "ai_knowledge_assistant"
}

variable "db_user" {
  description = "PostgreSQL user"
  type        = string
  default     = "postgres"
}

variable "db_password" {
  description = "PostgreSQL password"
  type        = string
  default     = "postgres"
  sensitive   = true
}
