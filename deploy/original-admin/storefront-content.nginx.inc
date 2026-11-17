location = /api/dev-admin-content {
    proxy_set_header Host dev.griipbuddy.com;
    proxy_set_header Authorization "";
    proxy_set_header Cookie "";
    proxy_read_timeout 8s;
    proxy_pass http://127.0.0.1:4359/admin/_storefront-content;
}
location /editorial/dev-admin/ {
    proxy_set_header Host dev.griipbuddy.com;
    proxy_set_header Authorization "";
    proxy_set_header Cookie "";
    proxy_read_timeout 45s;
    proxy_pass http://127.0.0.1:4359/admin/_storefront-content/media/;
}
