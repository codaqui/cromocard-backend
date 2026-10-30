-- CreateIndex
CREATE UNIQUE INDEX "users_oauth_provider_oauth_id_key" ON "users"("oauth_provider", "oauth_id");

