proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Host $host;
proxy_set_header X-Forwarded-Proto https;
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header Authorization $http_authorization;
proxy_set_header Cookie $http_cookie;
proxy_read_timeout 45s;
proxy_pass http://127.0.0.1:4359;
