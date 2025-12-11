.PHONY: deploy build-local

DEPLOY_SERVERS ?= ktb-fe01
DEPLOY_PATH ?= /home/ubuntu/ktb-chat-frontend

build-local:
	@echo "🏗️  Building locally..."
	npm run build:production
	@echo "✅ Local build completed!"

deploy:
	@echo "📦 Deploying to remote servers..."
	@for server in $(DEPLOY_SERVERS); do \
	   echo "→ Deploying to $$server..."; \
	   ssh -o StrictHostKeyChecking=no ubuntu@$$server "mkdir -p $(DEPLOY_PATH)"; \
	   echo "  📁 Copying standalone build..."; \
	   rsync -avz --delete --exclude='*.log' --exclude='.env*' --exclude="server.pid" \
	      -e "ssh -o StrictHostKeyChecking=no" \
	      .next/standalone/ ubuntu@$$server:$(DEPLOY_PATH)/; \
	   echo "  ✅ Deployment to $$server completed!"; \
	done