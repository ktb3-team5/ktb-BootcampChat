.PHONY: deploy build-local

# 배포 대상 서버 목록
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
		rsync -avz --delete --exclude='*.log' --exclude='.env*' --exclude="server.pid" --exclude='/package.json' -e "ssh -o StrictHostKeyChecking=no" .next/standalone/ ubuntu@$$server:$(DEPLOY_PATH)/; \
		rsync -avz -e "ssh -o StrictHostKeyChecking=no" .next/static ubuntu@$$server:$(DEPLOY_PATH)/.next/; \
		rsync -avz -e "ssh -o StrictHostKeyChecking=no" public ubuntu@$$server:$(DEPLOY_PATH)/; \
		rsync -avz -e "ssh -o StrictHostKeyChecking=no" restart.sh ubuntu@$$server:$(DEPLOY_PATH)/; \
		ssh -o StrictHostKeyChecking=no ubuntu@$$server "cd $(DEPLOY_PATH) && chmod +x restart.sh && ./restart.sh"; \
		echo "✅ Deployment to $$server completed!"; \
	done
	@echo "✅ All deployments completed!"