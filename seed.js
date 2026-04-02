require('dotenv').config();
const bcrypt = require('bcryptjs');
const { User, Job, Resume, Application, Notification, Favorite } = require('./src/models');
const db = require('./src/config/connection');

const SENHA_PADRAO = process.env.SEED_PASSWORD;
if (!SENHA_PADRAO) { process.exit(1); }

const empresas = [
    {
        name: 'TechBridge Solutions',
        email: 'rh@techbridge.linkup.dev',
        bio: 'Empresa de desenvolvimento de software focada em soluções para o setor financeiro.',
        city: 'São Paulo, SP',
        sector: 'Tecnologia',
        companySize: '51-200',
        website: 'https://techbridge.linkup.dev',
        linkedinCompany: 'https://linkedin.com/company/techbridge-linkup'
    },
    {
        name: 'Nexus Digital',
        email: 'rh@nexusdigital.linkup.dev',
        bio: 'Agência de transformação digital com foco em e-commerce e marketplaces.',
        city: 'Curitiba, PR',
        sector: 'Marketing Digital',
        companySize: '11-50',
        website: 'https://nexusdigital.linkup.dev',
        linkedinCompany: 'https://linkedin.com/company/nexusdigital-linkup'
    },
    {
        name: 'CloudOps Brasil',
        email: 'jobs@cloudops.linkup.dev',
        bio: 'Especialistas em infraestrutura cloud, DevOps e segurança da informação.',
        city: 'Belo Horizonte, MG',
        sector: 'Infraestrutura / Cloud',
        companySize: '201-500',
        website: 'https://cloudops.linkup.dev',
        linkedinCompany: 'https://linkedin.com/company/cloudops-linkup'
    },
    {
        name: 'Vitalmed Saúde',
        email: 'rh@vitalmed.linkup.dev',
        bio: 'Rede de clínicas e hospitais com presença em 8 estados brasileiros.',
        city: 'São Paulo, SP',
        sector: 'Saúde',
        companySize: '501-1000',
        website: 'https://vitalmed.linkup.dev',
        linkedinCompany: 'https://linkedin.com/company/vitalmed-linkup'
    },
    {
        name: 'Rumo Educação',
        email: 'pessoas@rumoeducacao.linkup.dev',
        bio: 'EdTech focada em cursos profissionalizantes e ensino técnico online.',
        city: 'Recife, PE',
        sector: 'Educação',
        companySize: '51-200',
        website: 'https://rumoeducacao.linkup.dev',
        linkedinCompany: 'https://linkedin.com/company/rumo-linkup'
    },
    {
        name: 'Construa Engenharia',
        email: 'talentos@construa.linkup.dev',
        bio: 'Construtora especializada em obras comerciais e industriais no Centro-Oeste.',
        city: 'Campo Grande, MS',
        sector: 'Engenharia / Construção',
        companySize: '201-500',
        website: 'https://construa.linkup.dev',
        linkedinCompany: 'https://linkedin.com/company/construa-linkup'
    },
    
    {
        name: 'Infrastack',
        email: 'contato@infrastack.linkup.dev',
        bio: 'Especialistas em infraestrutura cloud-native, automação e práticas DevOps/SRE. Ajudamos times de engenharia a escalar com segurança e confiabilidade.',
        city: 'Porto Alegre, RS',
        sector: 'Infraestrutura / DevOps',
        companySize: '11-50',
        website: 'https://infrastack.linkup.dev',
        linkedinCompany: 'https://linkedin.com/company/infrastack-linkup'
    },
    
    {
        name: 'FinCore Soluções',
        email: 'vagas@fincore.linkup.dev',
        bio: 'Fintech focada em Open Finance, crédito inteligente e controladoria digital. Combinamos dados e tecnologia para transformar decisões financeiras.',
        city: 'Rio de Janeiro, RJ',
        sector: 'Fintech / Serviços Financeiros',
        companySize: '51-200',
        website: 'https://fincore.linkup.dev',
        linkedinCompany: 'https://linkedin.com/company/fincore-linkup'
    },
   
    {
        name: 'BIM Construtora',
        email: 'rh@bimconstrutora.linkup.dev',
        bio: 'Construtora referência em metodologia BIM no Sul do Brasil. Atuamos em obras residenciais e comerciais de médio e grande porte com tecnologia de ponta.',
        city: 'Porto Alegre, RS',
        sector: 'Construção Civil / BIM',
        companySize: '201-500',
        website: 'https://bimconstrutora.linkup.dev',
        linkedinCompany: 'https://linkedin.com/company/bimconstrutora-linkup'
    },
    
    {
        name: 'HealthData Tech',
        email: 'talentos@healthdata.linkup.dev',
        bio: 'Startup de saúde digital que transforma dados clínicos em inteligência para hospitais e operadoras de saúde. Stack moderna, impacto real.',
        city: 'São Paulo, SP',
        sector: 'Health Tech / Dados em Saúde',
        companySize: '11-50',
        website: 'https://healthdata.linkup.dev',
        linkedinCompany: 'https://linkedin.com/company/healthdata-linkup'
    }
];

const candidatos = [
    
    {
        name: 'Ana Paula Ferreira',
        email: 'ana.ferreira@gmail.com',
        bio: 'Desenvolvedora frontend apaixonada por UI/UX e acessibilidade web.',
        city: 'São Paulo, SP',
        github: 'https://github.com/anaferreira',
        linkedin: 'https://linkedin.com/in/anaferreira',
        phone: '11991234567',
        birthDate: '1998-04-15',
        resume: {
            summary: 'Desenvolvedora frontend com 3 anos de experiência em React, Vue.js e design de interfaces.',
            skills: JSON.stringify(['React', 'Vue.js', 'TypeScript', 'CSS', 'Figma', 'Git', 'Node.js']),
            experiences: JSON.stringify([
                { role: 'Desenvolvedora Frontend', company: 'Agência Pixel', period: '2022 - 2024', description: 'Desenvolvimento de interfaces responsivas com React e integração com APIs REST.' },
                { role: 'Estagiária de TI', company: 'StartupX', period: '2021 - 2022', description: 'Suporte ao desenvolvimento frontend e criação de componentes reutilizáveis.' }
            ]),
            education: JSON.stringify([
                { course: 'Análise e Desenvolvimento de Sistemas', institution: 'FATEC São Paulo', period: '2019 - 2022' }
            ])
        }
    },
   
    {
        name: 'Carlos Eduardo Lima',
        email: 'carlos.lima@hotmail.com',
        bio: 'Desenvolvedor backend focado em Node.js e arquiteturas de microsserviços.',
        city: 'Curitiba, PR',
        github: 'https://github.com/carloslima',
        linkedin: 'https://linkedin.com/in/carloslima-dev',
        phone: '41987654321',
        birthDate: '1996-09-22',
        resume: {
            summary: 'Backend developer com 4 anos de experiência em Node.js, Python e bancos de dados relacionais e NoSQL.',
            skills: JSON.stringify(['Node.js', 'Python', 'PostgreSQL', 'MongoDB', 'Docker', 'AWS', 'REST APIs']),
            experiences: JSON.stringify([
                { role: 'Desenvolvedor Backend', company: 'FinTech Alpha', period: '2021 - 2024', description: 'Construção de APIs REST para sistema de pagamentos com Node.js e PostgreSQL.' },
                { role: 'Desenvolvedor Junior', company: 'Web Solutions', period: '2020 - 2021', description: 'Desenvolvimento de funcionalidades em Python/Django.' }
            ]),
            education: JSON.stringify([
                { course: 'Ciência da Computação', institution: 'UFPR', period: '2015 - 2019' }
            ])
        }
    },
    
    {
        name: 'Juliana Costa Mendes',
        email: 'ju.mendes@gmail.com',
        bio: 'UX Designer & Product Designer com foco em pesquisa com usuários e prototipagem.',
        city: 'Rio de Janeiro, RJ',
        github: 'https://github.com/jumendes',
        linkedin: 'https://linkedin.com/in/julianamendes',
        phone: '21976543210',
        birthDate: '1997-01-30',
        resume: {
            summary: 'Designer de produto com experiência em pesquisa UX, design systems e prototipagem no Figma.',
            skills: JSON.stringify(['Figma', 'Adobe XD', 'Pesquisa UX', 'Design System', 'Prototipagem', 'HTML', 'CSS']),
            experiences: JSON.stringify([
                { role: 'UX Designer', company: 'SaaS Corp', period: '2022 - 2024', description: 'Liderança do design de 3 produtos SaaS, desde descoberta até entrega.' },
                { role: 'Designer Jr', company: 'Estúdio Criativo', period: '2020 - 2022', description: 'Design de interfaces e identidade visual para clientes do varejo.' }
            ]),
            education: JSON.stringify([
                { course: 'Design Digital', institution: 'PUC-Rio', period: '2016 - 2020' }
            ])
        }
    },
    
    {
        name: 'Roberto Alves Santos',
        email: 'roberto.santos@outlook.com',
        bio: 'DevOps Engineer com foco em automação, CI/CD e infraestrutura como código.',
        city: 'Belo Horizonte, MG',
        github: 'https://github.com/robertoalves',
        linkedin: 'https://linkedin.com/in/robertoalves',
        phone: '31965432109',
        birthDate: '1994-07-11',
        resume: {
            summary: 'DevOps com 5 anos de experiência em AWS, Kubernetes e automação de pipelines. Certificado AWS Solutions Architect.',
            skills: JSON.stringify(['AWS', 'Kubernetes', 'Docker', 'Terraform', 'CI/CD', 'Linux', 'Python', 'Ansible']),
            experiences: JSON.stringify([
                { role: 'DevOps Engineer', company: 'CloudOps Brasil', period: '2020 - 2024', description: 'Gerenciamento de infraestrutura cloud para 50+ clientes com uptime de 99.9%.' },
                { role: 'SysAdmin', company: 'Datacenter Sul', period: '2018 - 2020', description: 'Administração de servidores Linux e virtualização com VMware.' }
            ]),
            education: JSON.stringify([
                { course: 'Redes de Computadores', institution: 'CEFET-MG', period: '2013 - 2017' }
            ])
        }
    },
    
    {
        name: 'Fernanda Oliveira',
        email: 'fernanda.oliveira@gmail.com',
        bio: 'Desenvolvedora fullstack com experiência em React e Django.',
        city: 'Porto Alegre, RS',
        github: 'https://github.com/feoliveira',
        linkedin: 'https://linkedin.com/in/feoliveira',
        phone: '51954321098',
        birthDate: '1999-11-05',
        resume: {
            summary: 'Fullstack developer com foco em React no frontend e Django no backend.',
            skills: JSON.stringify(['React', 'Django', 'Python', 'PostgreSQL', 'Docker', 'Git', 'JavaScript']),
            experiences: JSON.stringify([
                { role: 'Desenvolvedora Fullstack', company: 'E-commerce Plus', period: '2022 - 2024', description: 'Desenvolvimento e manutenção de plataforma de e-commerce com React e Django.' }
            ]),
            education: JSON.stringify([
                { course: 'Engenharia de Software', institution: 'PUCRS', period: '2018 - 2022' }
            ])
        }
    },
   
    {
        name: 'Marcos Vinicius Rocha',
        email: 'marcos.rocha@gmail.com',
        bio: 'Analista de RH com foco em recrutamento e seleção para empresas de tecnologia.',
        city: 'São Paulo, SP',
        github: null,
        linkedin: 'https://linkedin.com/in/marcosrocha-rh',
        phone: '11982345678',
        birthDate: '1993-03-18',
        resume: {
            summary: 'Especialista em RH com 6 anos de experiência em recrutamento tech, employer branding e desenvolvimento organizacional.',
            skills: JSON.stringify(['Recrutamento', 'Seleção', 'Employer Branding', 'LinkedIn Recruiter', 'Excel', 'Power BI', 'Entrevista por Competências']),
            experiences: JSON.stringify([
                { role: 'Analista de RH Sênior', company: 'Grupo Alfa', period: '2020 - 2024', description: 'Responsável por recrutamento tech, reduzindo tempo de contratação em 35%.' },
                { role: 'Analista de RH', company: 'Consultoria Talentos', period: '2018 - 2020', description: 'Processos seletivos para cargos de TI e Marketing.' }
            ]),
            education: JSON.stringify([
                { course: 'Psicologia', institution: 'Mackenzie', period: '2012 - 2017' },
                { course: 'MBA em Gestão de Pessoas', institution: 'FGV', period: '2019 - 2020' }
            ])
        }
    },
   
    {
        name: 'Beatriz Almeida',
        email: 'beatriz.almeida@gmail.com',
        bio: 'Analista financeira com especialização em controladoria e FP&A.',
        city: 'São Paulo, SP',
        github: null,
        linkedin: 'https://linkedin.com/in/beatrizalmeida-fin',
        phone: '11973456789',
        birthDate: '1995-07-22',
        resume: {
            summary: 'Analista financeira com 5 anos de experiência em FP&A, controladoria e análise de investimentos.',
            skills: JSON.stringify(['Excel Avançado', 'Power BI', 'SQL', 'SAP', 'FP&A', 'Controladoria', 'Valuation', 'IFRS']),
            experiences: JSON.stringify([
                { role: 'Analista Financeiro Sênior', company: 'Banco Meridian', period: '2021 - 2024', description: 'Elaboração de relatórios gerenciais e análise de rentabilidade por produto.' },
                { role: 'Analista Financeiro', company: 'Contábil Express', period: '2019 - 2021', description: 'Conciliação bancária, DRE e suporte ao planejamento orçamentário.' }
            ]),
            education: JSON.stringify([
                { course: 'Ciências Contábeis', institution: 'USP', period: '2014 - 2018' },
                { course: 'MBA em Finanças Corporativas', institution: 'Insper', period: '2020 - 2021' }
            ])
        }
    },
    
    {
        name: 'Rafael Sousa Nunes',
        email: 'rafael.nunes@outlook.com',
        bio: 'Engenheiro civil com foco em gestão de obras e projetos industriais.',
        city: 'Campo Grande, MS',
        github: null,
        linkedin: 'https://linkedin.com/in/rafaelnunes-eng',
        phone: '67991234567',
        birthDate: '1991-11-09',
        resume: {
            summary: 'Engenheiro civil com 8 anos de experiência em gestão de obras comerciais e industriais, orçamento e fiscalização.',
            skills: JSON.stringify(['AutoCAD', 'MS Project', 'Orçamento de Obras', 'PMBOK', 'Gestão de Equipes', 'NR-18', 'BIM']),
            experiences: JSON.stringify([
                { role: 'Gerente de Obras', company: 'Construtora Ômega', period: '2019 - 2024', description: 'Gestão de obras industriais com orçamento de R$ 15M e equipe de 40 pessoas.' },
                { role: 'Engenheiro de Campo', company: 'Edificar Construções', period: '2016 - 2019', description: 'Acompanhamento de obras residenciais e elaboração de cronogramas.' }
            ]),
            education: JSON.stringify([
                { course: 'Engenharia Civil', institution: 'UFMS', period: '2010 - 2015' }
            ])
        }
    },
    
    {
        name: 'Lucas Henrique Silva',
        email: 'lucas.silva@gmail.com',
        bio: 'Desenvolvedor backend especializado em Node.js, microsserviços e cloud AWS.',
        city: 'São Paulo, SP',
        github: 'https://github.com/lucassilva',
        linkedin: 'https://linkedin.com/in/lucassilva-dev',
        phone: '11994567890',
        birthDate: '1997-06-14',
        resume: {
            summary: 'Backend developer com 3 anos de experiência em Node.js, AWS e arquitetura de microsserviços.',
            skills: JSON.stringify(['Node.js', 'TypeScript', 'PostgreSQL', 'Redis', 'Docker', 'AWS', 'GraphQL', 'REST APIs']),
            experiences: JSON.stringify([
                { role: 'Desenvolvedor Backend', company: 'Startup Finance', period: '2022 - 2024', description: 'Desenvolvimento de microsserviços em Node.js com deploy em AWS ECS.' },
                { role: 'Desenvolvedor Junior', company: 'Agência Web', period: '2021 - 2022', description: 'APIs REST com Node.js e integrações com sistemas externos.' }
            ]),
            education: JSON.stringify([
                { course: 'Sistemas de Informação', institution: 'FIAP', period: '2017 - 2021' }
            ])
        }
    },
    
    {
        name: 'Sofia Torres Campos',
        email: 'sofia.torres@gmail.com',
        bio: 'Desenvolvedora frontend com paixão por React, TypeScript e performance web.',
        city: 'São Paulo, SP',
        github: 'https://github.com/sofiatorres',
        linkedin: 'https://linkedin.com/in/sofiatorres-dev',
        phone: '11985432109',
        birthDate: '2000-02-28',
        resume: {
            summary: 'Frontend developer com 2 anos de experiência em React, TypeScript e construção de design systems.',
            skills: JSON.stringify(['React', 'TypeScript', 'Next.js', 'CSS', 'Storybook', 'Git', 'Figma', 'Jest']),
            experiences: JSON.stringify([
                { role: 'Desenvolvedora Frontend', company: 'ProductHouse', period: '2023 - 2024', description: 'Desenvolvimento de componentes React com TypeScript e documentação em Storybook.' },
                { role: 'Estagiária Frontend', company: 'DigitalLab', period: '2022 - 2023', description: 'Criação de interfaces responsivas e integração com APIs.' }
            ]),
            education: JSON.stringify([
                { course: 'Ciência da Computação', institution: 'USP', period: '2019 - 2023' }
            ])
        }
    }
];


const vagas = [

    {
        empresaIndex: 0,
        title: 'Desenvolvedor Frontend React',
        description: 'Buscamos desenvolvedor frontend para atuar no desenvolvimento de interfaces modernas para nosso produto SaaS financeiro em uma squad ágil.',
        requirements: 'React.js (mínimo 2 anos), TypeScript, CSS avançado, Git, experiência com APIs REST.',
        benefits: 'Plano de saúde, vale refeição, auxílio home office, PLR anual, cursos pagos.',
        differential: 'Experiência com testes automatizados (Jest/Cypress), conhecimento em design systems.',
        salary: '7.000 - 10.000', modality: 'remoto', city: 'Remoto', status: 'aberta', views: 142,
        contractType: 'pj',
        stages: ['Triagem', 'Entrevista Técnica', 'Entrevista RH']
    },
  
    {
        empresaIndex: 0,
        title: 'Desenvolvedor Backend Node.js',
        description: 'Vaga para desenvolvedor backend focado em construção de APIs escaláveis para nosso sistema de processamento de transações financeiras.',
        requirements: 'Node.js, PostgreSQL, arquitetura REST/GraphQL, Docker básico.',
        benefits: 'Plano de saúde e odontológico, vale refeição, bônus semestral.',
        differential: 'Experiência com mensageria (RabbitMQ/Kafka), microsserviços.',
        salary: '8.000 - 12.000', modality: 'híbrido', city: 'São Paulo', status: 'aberta', views: 98,
        contractType: 'clt',
        stages: ['Triagem', 'Teste Técnico', 'Entrevista Final']
    },
    
    {
        empresaIndex: 0,
        title: 'Tech Lead Frontend',
        description: 'Posição de liderança técnica para o time de frontend. Responsável por arquitetura, code reviews e mentoria.',
        requirements: 'Mínimo 5 anos em frontend, React, liderança de times, TypeScript avançado.',
        benefits: 'Pacote completo: saúde, odonto, vale refeição, stock options, PLR.',
        differential: 'Experiência com micro-frontends, contribuições open source.',
        salary: '14.000 - 18.000', modality: 'híbrido', city: 'São Paulo', status: 'encerrada', views: 203,
        contractType: 'clt',
        stages: []
    },
    
    {
        empresaIndex: 1,
        title: 'UX/UI Designer',
        description: 'Procuramos designer para criar experiências incríveis em projetos de e-commerce e marketplace, trabalhando diretamente com clientes.',
        requirements: 'Figma avançado, portfólio sólido, pesquisa com usuários, prototipagem.',
        benefits: 'Vale refeição, plano de saúde, horário flexível, home office 3x por semana.',
        differential: 'Conhecimento em HTML/CSS, experiência com design de e-commerce.',
        salary: '5.500 - 8.000', modality: 'híbrido', city: 'Curitiba', status: 'aberta', views: 87,
        contractType: 'pj',
        stages: ['Triagem', 'Apresentação de Portfolio', 'Desafio Prático', 'Entrevista RH']
    },
   
    {
        empresaIndex: 1,
        title: 'Desenvolvedor React + Next.js',
        description: 'Vaga para desenvolvedor focado em performance e SEO para plataformas de e-commerce com alto volume de acesso.',
        requirements: 'React, Next.js, JavaScript moderno, CSS/Styled Components, experiência com e-commerce.',
        benefits: 'Vale refeição, plano de saúde, equipamento fornecido.',
        differential: 'Experiência com Shopify, VTEX ou plataformas similares.',
        salary: '6.000 - 9.000', modality: 'remoto', city: 'Remoto', status: 'aberta', views: 115,
        contractType: 'freelancer',
        stages: []
    },
    
    {
        empresaIndex: 1,
        title: 'Analista de Marketing Digital',
        description: 'Analista para gerenciar campanhas de performance e estratégia de conteúdo para clientes do setor de varejo.',
        requirements: 'Google Ads, Meta Ads, Google Analytics, Excel avançado.',
        benefits: 'Vale refeição, plano de saúde, comissão por resultados.',
        differential: 'Experiência com e-commerce, certificação Google.',
        salary: '4.000 - 6.000', modality: 'presencial', city: 'Curitiba', status: 'aberta', views: 54,
        contractType: 'clt',
        stages: []
    },
    
    {
        empresaIndex: 1,
        title: 'Gerente de Conteúdo',
        description: 'Responsável pela estratégia de conteúdo da agência, liderando equipe de redatores e coordenando produção para múltiplos clientes.',
        requirements: 'Experiência em gestão de conteúdo, SEO, redação persuasiva, gestão de equipes.',
        benefits: 'Vale refeição, plano de saúde, home office, bônus por performance.',
        differential: 'Experiência com e-commerce, inglês intermediário.',
        salary: '5.000 - 7.500', modality: 'híbrido', city: 'Curitiba', status: 'aberta', views: 67,
        contractType: 'clt',
        stages: []
    },
   
    {
        empresaIndex: 2,
        title: 'DevOps Engineer',
        description: 'Buscamos DevOps para ampliar nosso time de infraestrutura gerenciando ambientes cloud complexos para clientes enterprise.',
        requirements: 'AWS ou GCP (certificação preferencial), Kubernetes, Terraform, CI/CD, Linux avançado.',
        benefits: 'Plano de saúde premium, vale refeição, auxílio certificações, home office total.',
        differential: 'Certificação AWS Solutions Architect ou CKA, experiência com Ansible.',
        salary: '10.000 - 15.000', modality: 'remoto', city: 'Remoto', status: 'encerrada', views: 176,
        contractType: 'pj',
        stages: ['Triagem', 'Entrevista Técnica', 'Case Prático', 'Proposta']
    },
    
    {
        empresaIndex: 2,
        title: 'Analista de Segurança da Informação',
        description: 'Posição para analista de segurança focado em cloud security e compliance em projetos de auditoria.',
        requirements: 'LGPD, ISO 27001, segurança em cloud AWS/Azure, pentest básico.',
        benefits: 'Plano de saúde, vale refeição, auxílio cursos e certificações.',
        differential: 'Certificação CISSP, CEH ou equivalente.',
        salary: '9.000 - 13.000', modality: 'remoto', city: 'Remoto', status: 'aberta', views: 93,
        contractType: 'clt',
        stages: ['Triagem', 'Entrevista Técnica', 'Entrevista com CISO']
    },
  
    {
        empresaIndex: 2,
        title: 'Engenheiro de Dados',
        description: 'Engenheiro de dados para construção e manutenção de pipelines para clientes do setor financeiro e saúde.',
        requirements: 'Python, Apache Spark, AWS (Glue, S3, Redshift), SQL avançado, Airflow.',
        benefits: 'Plano de saúde, vale refeição, PLR, stock options.',
        differential: 'Experiência com dados em tempo real (Kafka/Kinesis), dbt.',
        salary: '12.000 - 16.000', modality: 'remoto', city: 'Remoto', status: 'aberta', views: 134,
        contractType: 'pj',
        stages: []
    },
   
    {
        empresaIndex: 3,
        title: 'Analista de RH — Recrutamento e Seleção',
        description: 'Responsável pelos processos seletivos da rede Vitalmed, desde triagem até onboarding de novos colaboradores.',
        requirements: 'Experiência em R&S, LinkedIn Recruiter, entrevista por competências, Excel.',
        benefits: 'Plano de saúde, vale refeição, vale transporte, convênio farmácia.',
        differential: 'Experiência em recrutamento para área de saúde, conhecimento em DISC.',
        salary: '3.500 - 5.000', modality: 'presencial', city: 'São Paulo', status: 'aberta', views: 89,
        contractType: 'clt',
        stages: []
    },
    
    {
        empresaIndex: 3,
        title: 'Analista Financeiro — Controladoria',
        description: 'Atuação na área de controladoria, responsável por relatórios gerenciais e acompanhamento de orçamento.',
        requirements: 'Ciências Contábeis ou Administração, Excel avançado, SAP, experiência em controladoria.',
        benefits: 'Plano de saúde e odontológico, vale refeição, PLR.',
        differential: 'Conhecimento em IFRS, experiência no setor de saúde.',
        salary: '5.000 - 7.000', modality: 'híbrido', city: 'São Paulo', status: 'aberta', views: 71,
        contractType: 'clt',
        stages: []
    },
   
    {
        empresaIndex: 3,
        title: 'Coordenador de Tecnologia da Informação',
        description: 'Coordenação da equipe de TI da rede, responsável por sistemas hospitalares, infraestrutura e projetos de transformação digital.',
        requirements: 'Graduação em TI, experiência em gestão de equipes, ITIL, infraestrutura e sistemas.',
        benefits: 'Plano de saúde premium, vale refeição, participação nos resultados.',
        differential: 'Experiência com sistemas hospitalares (TASY, MV), certificação ITIL.',
        salary: '8.000 - 11.000', modality: 'presencial', city: 'São Paulo', status: 'aberta', views: 58,
        contractType: 'clt',
        stages: []
    },
    
    {
        empresaIndex: 4,
        title: 'Desenvolvedor Fullstack — Plataforma EAD',
        description: 'Desenvolvedor para evoluir nossa plataforma de ensino online, implementando novas funcionalidades e melhorando a experiência dos alunos.',
        requirements: 'Node.js, React, PostgreSQL, experiência com desenvolvimento de plataformas web.',
        benefits: 'Plano de saúde, vale refeição, cursos gratuitos na plataforma, home office.',
        differential: 'Experiência com LMS (Moodle, Canvas), gamificação.',
        salary: '5.500 - 8.500', modality: 'remoto', city: 'Remoto', status: 'aberta', views: 104,
        contractType: 'pj',
        stages: ['Triagem', 'Desafio Técnico', 'Entrevista com CTO']
    },
    
    {
        empresaIndex: 4,
        title: 'Especialista em Design Instrucional',
        description: 'Responsável pela estruturação e qualidade pedagógica dos cursos da plataforma, trabalhando com educadores e especialistas de conteúdo.',
        requirements: 'Pedagogia ou Educação, experiência com EAD, ferramentas de autoria (Articulate, Rise).',
        benefits: 'Vale refeição, plano de saúde, cursos gratuitos, home office.',
        differential: 'Experiência com gamificação, storytelling educacional.',
        salary: '4.000 - 6.000', modality: 'remoto', city: 'Remoto', status: 'aberta', views: 43,
        contractType: 'clt',
        stages: []
    },
   
    {
        empresaIndex: 4,
        title: 'Analista de Marketing — Growth',
        description: 'Responsável por estratégias de aquisição e retenção de alunos, atuando com funil de vendas e campanhas digitais.',
        requirements: 'Marketing digital, Google Ads, Meta Ads, CRM, análise de dados.',
        benefits: 'Vale refeição, plano de saúde, comissão por metas, home office.',
        differential: 'Experiência no setor educacional, inglês intermediário.',
        salary: '4.500 - 6.500', modality: 'remoto', city: 'Remoto', status: 'aberta', views: 76,
        contractType: 'pj',
        stages: []
    },
  
    {
        empresaIndex: 5,
        title: 'Engenheiro Civil — Gestão de Obras',
        description: 'Gerenciamento de obras comerciais e industriais no Centro-Oeste, liderando equipes e garantindo prazo, qualidade e custo.',
        requirements: 'Engenharia Civil, CREA ativo, experiência em obras comerciais/industriais, MS Project.',
        benefits: 'Vale refeição, vale transporte, plano de saúde, veículo disponível.',
        differential: 'Experiência com BIM, gestão de contratos, PMBOK.',
        salary: '7.000 - 10.000', modality: 'presencial', city: 'Campo Grande', status: 'aberta', views: 62,
        contractType: 'clt',
        stages: ['Triagem', 'Entrevista Técnica', 'Entrevista com Diretor']
    },
   
    {
        empresaIndex: 5,
        title: 'Analista de RH — Departamento Pessoal',
        description: 'Responsável pela folha de pagamento, admissões, demissões e gestão de benefícios para colaboradores das obras.',
        requirements: 'Experiência em DP, eSocial, folha de pagamento, legislação trabalhista.',
        benefits: 'Vale refeição, vale transporte, plano de saúde.',
        differential: 'Experiência no setor de construção civil, conhecimento em TOTVS.',
        salary: '3.000 - 4.500', modality: 'presencial', city: 'Campo Grande', status: 'aberta', views: 38,
        contractType: 'clt',
        stages: []
    },
    
    {
        empresaIndex: 5,
        title: 'Analista Financeiro — Controladoria de Obras',
        description: 'Acompanhamento financeiro de obras, análise de custos, orçamento e controle de contratos com fornecedores.',
        requirements: 'Ciências Contábeis ou Administração, Excel avançado, experiência em controladoria.',
        benefits: 'Vale refeição, plano de saúde, PLR semestral.',
        differential: 'Experiência no setor de construção civil, conhecimento em ERP.',
        salary: '4.500 - 6.500', modality: 'presencial', city: 'Campo Grande', status: 'aberta', views: 29,
        contractType: 'temporario',
        stages: []
    },

  
    {
        empresaIndex: 6,
        title: 'Engenheiro DevOps — Kubernetes & CI/CD',
        description: 'Automação de pipelines CI/CD, gestão de clusters Kubernetes e infraestrutura como código com Terraform e Ansible.',
        requirements: 'Kubernetes, Docker, CI/CD com GitHub Actions ou GitLab CI, Terraform, Ansible, Linux, AWS, Python. Monitoramento com Prometheus e Grafana.',
        benefits: 'Home office 100%, vale refeição R$50/dia, plano de saúde Bradesco, stock options, budget para certificações AWS/CKA.',
        differential: 'Certificação CKA ou AWS Solutions Architect. Experiência com GitOps e ArgoCD.',
        salary: '9.000 - 14.000', modality: 'remoto', city: 'Remoto', status: 'aberta', views: 88,
        isPcd: false, contractType: 'clt',
        stages: ['Triagem', 'Entrevista Técnica', 'Case Prático']
    },
  
    {
        empresaIndex: 6,
        title: 'SRE Engineer — AWS & Terraform',
        description: 'Garantir confiabilidade, performance e escalabilidade dos sistemas em produção. Trabalho com AWS, Terraform, Python e Linux para automatizar operações e definir SLOs e SLAs.',
        requirements: 'AWS (EC2, EKS, RDS, Lambda), Terraform, Python, Linux, Docker, Kubernetes. Visão SRE: SLI, SLO, error budget. Ansible desejável.',
        benefits: 'Remote-first, flexibilidade de horário, plano de saúde, PLR, budget R$3.000/ano para certificações.',
        differential: 'Experiência com Chaos Engineering, OpenTelemetry e pipelines CI/CD complexos.',
        salary: '11.000 - 16.000', modality: 'remoto', city: 'Remoto', status: 'aberta', views: 61,
        isPcd: false, contractType: 'clt',
        stages: []
    },
  
    {
        empresaIndex: 6,
        title: 'Analista de Infraestrutura Cloud',
        description: 'Vaga prioritária para PCD. Gestão e monitoramento de infraestrutura cloud, suporte a ambientes Linux e automação com Bash e Python.',
        requirements: 'AWS ou Azure, Linux, Docker, redes (TCP/IP, DNS, HTTP), Bash, Python básico.',
        benefits: 'Infraestrutura acessível, home office 3x por semana, plano de saúde, vale transporte e refeição.',
        differential: 'Terraform ou Ansible. Certificação AWS Cloud Practitioner.',
        salary: '5.000 - 8.000', modality: 'híbrido', city: 'Porto Alegre', status: 'aberta', views: 34,
        isPcd: true, contractType: 'clt',
        stages: []
    },

   
    {
        empresaIndex: 7,
        title: 'Analista Financeiro — FP&A & Valuation',
        description: 'Modelagem financeira, valuation, projeções orçamentárias, controladoria e relatórios IFRS para o time de FP&A.',
        requirements: 'FP&A, valuation, controladoria, IFRS, Excel avançado, Power BI, SQL. SAP desejável. Graduação em Contabilidade, Economia ou Administração.',
        benefits: 'Plano de saúde Amil, vale refeição, PLR semestral, gympass, home office 2x semana.',
        differential: 'Certificação CFA ou CPA-20. Automação de relatórios com Python ou Power BI Service.',
        salary: '7.000 - 10.000', modality: 'híbrido', city: 'Rio de Janeiro', status: 'aberta', views: 72,
        isPcd: false, contractType: 'clt',
        stages: ['Triagem', 'Teste Técnico', 'Entrevista com CFO']
    },
  
    {
        empresaIndex: 7,
        title: 'Desenvolvedor Backend Python — Open Finance',
        description: 'Construir APIs de Open Finance, integrar com o ecossistema do Banco Central e garantir segurança e performance das integrações financeiras.',
        requirements: 'Python avançado, REST APIs, PostgreSQL, Docker, AWS. Segurança de APIs e OAuth2.',
        benefits: 'Remote-first, stock options, plano de saúde Bradesco, R$2.000 de budget para estudos por ano.',
        differential: 'Experiência com ecossistema Open Finance. FastAPI e Celery.',
        salary: '8.000 - 13.000', modality: 'remoto', city: 'Remoto', status: 'aberta', views: 95,
        isPcd: false, contractType: 'clt',
        stages: []
    },
    
    {
        empresaIndex: 7,
        title: 'Analista de Dados — SQL & Power BI',
        description: 'Dashboards financeiros, automação de relatórios e apoio ao time de controladoria com SQL, Power BI e Excel avançado.',
        requirements: 'SQL avançado, Power BI, Excel avançado, Python para automação. SAP desejável.',
        benefits: 'Plano de saúde, vale refeição, PLR, home office 2x semana.',
        differential: 'Power BI Service, Data Gateway e relatórios automatizados com Python.',
        salary: '5.500 - 8.500', modality: 'híbrido', city: 'Rio de Janeiro', status: 'aberta', views: 48,
        isPcd: false, contractType: 'clt',
        stages: []
    },

  
    {
        empresaIndex: 8,
        title: 'Engenheiro Civil — BIM & Revit',
        description: 'Coordenar projetos em BIM, modelar no Revit e AutoCAD e gerenciar cronogramas com MS Project seguindo PMBOK.',
        requirements: 'Engenharia Civil. BIM, Revit, AutoCAD, MS Project, PMBOK, orçamento de obras, NR-18.',
        benefits: 'Plano de saúde, vale refeição, vale transporte, participação nos lucros, treinamentos BIM.',
        differential: 'Certificação PMP ou CBIM. Navisworks para clash detection.',
        salary: '7.000 - 11.000', modality: 'híbrido', city: 'Porto Alegre', status: 'aberta', views: 57,
        isPcd: false, contractType: 'clt',
        stages: ['Triagem', 'Entrevista Técnica', 'Entrevista com Diretor']
    },
   
    {
        empresaIndex: 8,
        title: 'Coordenador de Obras — PMBOK & MS Project',
        description: 'Liderar equipes em campo, controlar cronogramas com MS Project, gerenciar orçamento de obras e garantir conformidade com NR-18 e PMBOK.',
        requirements: 'Engenharia Civil ou Arquitetura. Gestão de equipes, PMBOK, MS Project, NR-18, orçamento de obras, AutoCAD. Mínimo 5 anos.',
        benefits: 'Veículo da empresa, plano de saúde Unimed, PLR, convênio odontológico.',
        differential: 'Certificação PMP e BIM 4D/5D para acompanhamento de obra.',
        salary: '9.000 - 13.000', modality: 'presencial', city: 'Porto Alegre', status: 'aberta', views: 41,
        isPcd: false, contractType: 'clt',
        stages: []
    },
   
    {
        empresaIndex: 8,
        title: 'Assistente Técnico de Obras — AutoCAD',
        description: 'Vaga exclusiva para PCD. Apoiar o time de projetos com modelagem em AutoCAD, leitura de plantas e controles de orçamento de obras.',
        requirements: 'Técnico em Edificações, Engenharia ou Arquitetura em andamento. AutoCAD, noções de orçamento de obras. NR-18 desejável.',
        benefits: 'Ambiente acessível, plano de saúde, vale transporte, vale refeição, horário flexível.',
        differential: 'BIM/Revit básico e MS Project.',
        salary: '2.800 - 4.000', modality: 'presencial', city: 'Porto Alegre', status: 'aberta', views: 22,
        isPcd: true, contractType: 'clt',
        stages: []
    },

    {
        empresaIndex: 9,
        title: 'Desenvolvedor Fullstack — React & Vue.js',
        description: 'Plataformas de saúde digital com React, Vue.js e Node.js no frontend e APIs REST no backend com PostgreSQL e Docker.',
        requirements: 'React, Vue.js, Node.js, TypeScript, REST APIs, PostgreSQL, Docker, Git.',
        benefits: 'Plano de saúde e odontológico Bradesco, vale refeição, home office 3x semana, stock options.',
        differential: 'Experiência com HL7 FHIR, sistemas hospitalares ou telemedicina.',
        salary: '8.000 - 12.000', modality: 'híbrido', city: 'São Paulo', status: 'aberta', views: 83,
        isPcd: false, contractType: 'clt',
        stages: ['Triagem', 'Desafio Técnico', 'Entrevista com CTO']
    },
    
    {
        empresaIndex: 9,
        title: 'Analista de RH — Employer Branding & T&D',
        description: 'Vaga prioritária para PCD. Employer branding, recrutamento e seleção com LinkedIn Recruiter e programas de T&D com indicadores em Power BI e Excel.',
        requirements: 'Recrutamento e seleção, employer branding, LinkedIn Recruiter, Excel avançado, Power BI, entrevista por competências.',
        benefits: 'Escritório acessível, plano de saúde, vale refeição, horário flexível, gympass.',
        differential: 'ATS, NPS de candidatos e dashboards de people analytics.',
        salary: '4.500 - 6.500', modality: 'híbrido', city: 'São Paulo', status: 'aberta', views: 31,
        isPcd: true, contractType: 'clt',
        stages: []
    }
];


const candidaturas = [
    // ── Vaga 0: Frontend React (TechBridge) — 5 candidatos em etapas diferentes ──
    [0, 0,  'aprovado',   'Entrevista RH'],        // Ana: passou por todas as etapas, aprovada
    [9, 0,  'em análise', 'Entrevista Técnica'],   // Sofia: avançou para entrevista técnica
    [4, 0,  'em análise', 'Triagem'],              // Fernanda: na triagem
    [8, 0,  'rejeitado',  null],                   // Lucas: recusado na triagem (backend, não é fit)

    // ── Vaga 1: Backend Node.js (TechBridge) — etapas ──
    [1, 1,  'em análise', 'Teste Técnico'],        // Carlos: no teste técnico
    [8, 1,  'em análise', 'Triagem'],              // Lucas: só entrou (boa fit real)
    [4, 1,  'rejeitado',  null],                   // Fernanda: recusada

    // ── Vaga 7: DevOps (CloudOps) — processo encerrado, Roberto CONTRATADO ──
    [3, 7,  'contratado', null],                   // Roberto: CONTRATADO! percorreu todo pipeline
    [1, 7,  'expirado',   null],                   // Carlos: vaga encerrada, não contratado
    [8, 7,  'expirado',   null],                   // Lucas: vaga encerrada, não contratado

    // ── Vaga 8: Segurança da Informação (CloudOps) — etapas ──
    [3, 8,  'aprovado',   'Entrevista com CISO'],  // Roberto: na última etapa

    // ── Vaga 3: UX/UI (Nexus) — etapas ──
    [2, 3,  'em análise', 'Desafio Prático'],      // Juliana: avançada no processo
    [9, 3,  'pendente',   'Triagem'],              // Sofia: candidatou-se (diferente da área dela)

    // ── Vaga 13: Fullstack EAD (Rumo) — etapas ──
    [0, 13, 'em análise', 'Desafio Técnico'],      // Ana: no desafio técnico
    [4, 13, 'pendente',   'Triagem'],              // Fernanda: em triagem

    // ── Vagas sem etapas ──
    [0, 4,  'pendente',   null],
    [2, 14, 'pendente',   null],
    [5, 10, 'pendente',   null],
    [5, 17, 'pendente',   null],
    [6, 11, 'pendente',   null],
    [6, 18, 'pendente',   null],
    [7, 16, 'pendente',   null],
    [7, 18, 'pendente',   null],
    [9, 4,  'pendente',   null],                   // Sofia: candidata ao React+Next.js
    [1, 9,  'aprovado',   null],                   // Carlos: aprovado em Engenheiro de Dados

    // ── Novas vagas ──
    [3, 19, 'em análise', 'Entrevista Técnica'],   // Roberto (DevOps) → Engenheiro DevOps Infrastack
    [3, 20, 'pendente',   null],                   // Roberto → SRE Engineer
    [6, 22, 'em análise', 'Teste Técnico'],        // Beatriz (Financeiro) → FP&A & Valuation
    [6, 24, 'pendente',   null],                   // Beatriz → Analista de Dados SQL
    [7, 25, 'pendente',   null],                   // Rafael (Civil) → Engenheiro Civil BIM
    [7, 26, 'pendente',   null],                   // Rafael → Coordenador de Obras
    [0, 28, 'pendente',   null],                   // Ana (React/Vue.js) → Fullstack React & Vue.js
    [4, 28, 'pendente',   null],                   // Fernanda → Fullstack React & Vue.js
    [5, 29, 'pendente',   null],                   // Marcos (RH) → Analista RH HealthData
];

const favoritos = [
    [0, 1], [0, 7],
    [1, 9], [1, 13],
    [2, 4], [2, 14],
    [3, 7], [3, 8],
    [4, 0], [4, 9],
    [5, 10], [5, 17],
    [6, 11], [6, 18],
    [7, 16],
    [8, 1], [8, 7],
    [9, 0], [9, 4],
];

async function seed() {
    try {
        await db.authenticate();
        await db.sync({ alter: true });
        console.log('\n🌱 Iniciando seed do LinkUp...\n');

        const existingUsers = await User.count();
        if (existingUsers > 2) {
            console.log('⚠️  Banco já possui dados. Pulando seed.');
            process.exit(0);
        }

        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(SENHA_PADRAO, salt);
        const empresasCreated = [], candidatosCreated = [], vagasCreated = [];

        console.log('🏢 Criando empresas...');
        for (const emp of empresas) {
            const user = await User.create({
                name: emp.name, email: emp.email, password: senhaHash,
                userType: 'empresa', isRecruiter: true, isVerified: true, onboardingComplete: true,
                bio: emp.bio, city: emp.city, sector: emp.sector, companySize: emp.companySize,
                website: emp.website, linkedinCompany: emp.linkedinCompany
            });
            empresasCreated.push(user);
            console.log(`   ✅ ${emp.name}`);
        }

        console.log('\n👤 Criando candidatos...');
        for (const cand of candidatos) {
            const user = await User.create({
                name: cand.name, email: cand.email, password: senhaHash,
                userType: 'candidato', isRecruiter: false, isVerified: true, onboardingComplete: true,
                bio: cand.bio, city: cand.city, github: cand.github, linkedin: cand.linkedin,
                phone: cand.phone, birthDate: cand.birthDate
            });
            candidatosCreated.push(user);
            await Resume.create({
                userId: user.id, phone: cand.phone, city: cand.city, birthDate: cand.birthDate,
                linkedin: cand.linkedin, github: cand.github, summary: cand.resume.summary,
                skills: cand.resume.skills, experiences: cand.resume.experiences, education: cand.resume.education
            });
            console.log(`   ✅ ${cand.name}`);
        }

        console.log('\n💼 Criando vagas...');
        for (const vaga of vagas) {
            const empresa = empresasCreated[vaga.empresaIndex];
            const job = await Job.create({
                title: vaga.title, company: empresa.name, description: vaga.description,
                requirements: vaga.requirements, benefits: vaga.benefits, differential: vaga.differential,
                salary: vaga.salary, modality: vaga.modality, city: vaga.city, status: vaga.status,
                contractType: vaga.contractType || null, isPcd: vaga.isPcd || false,
                views: vaga.views, email: empresa.email, UserId: empresa.id, new_job: false,
                stages: JSON.stringify(vaga.stages || [])
            });
            vagasCreated.push(job);
            const stagesLabel = vaga.stages && vaga.stages.length ? ` [${vaga.stages.length} etapas]` : '';
            console.log(`   ✅ ${vaga.title} (${empresa.name})${stagesLabel}`);
        }

        console.log('\n📨 Criando candidaturas...');
        for (const [candIdx, vagaIdx, status, currentStage] of candidaturas) {
            const candidato = candidatosCreated[candIdx];
            const vaga      = vagasCreated[vagaIdx];
            const empresa   = empresasCreated[vagas[vagaIdx].empresaIndex];

            // Gera stageHistory simples baseado no currentStage
            let stageHistory = '[]';
            if (currentStage && vagas[vagaIdx].stages && vagas[vagaIdx].stages.length) {
                const allStages = vagas[vagaIdx].stages;
                const stageIdx  = allStages.indexOf(currentStage);
                if (stageIdx >= 0) {
                    const history = allStages.slice(0, stageIdx + 1).map((s, i) => ({
                        stage: s,
                        movedAt: new Date(Date.now() - (stageIdx - i + 1) * 2 * 24 * 60 * 60 * 1000).toISOString()
                    }));
                    stageHistory = JSON.stringify(history);
                }
            }

            await Application.create({ userId: candidato.id, jobId: vaga.id, status, currentStage: currentStage || null, stageHistory });

            // Notificação para a empresa
            await Notification.create({
                userId: empresa.id,
                message: `${candidato.name} se candidatou para "${vaga.title}"`,
                type: 'info', link: `/jobs/applications/${vaga.id}`, read: false
            });

            // Notificação de etapa para o candidato
            if (currentStage) {
                await Notification.create({
                    userId: candidato.id,
                    message: `Sua candidatura para "${vaga.title}" avançou para a etapa: ${currentStage}`,
                    type: 'info', link: `/jobs/view/${vaga.id}`, read: false
                });
            }

            // Notificação de resultado final
            if (status === 'aprovado') {
                await Notification.create({
                    userId: candidato.id,
                    message: `Sua candidatura para "${vaga.title}" foi aprovada! 🎉`,
                    type: 'success', link: `/jobs/view/${vaga.id}`, read: false
                });
            } else if (status === 'rejeitado') {
                await Notification.create({
                    userId: candidato.id,
                    message: `Sua candidatura para "${vaga.title}" não foi aprovada desta vez.`,
                    type: 'danger', link: `/jobs/view/${vaga.id}`, read: false
                });
            } else if (status === 'contratado') {
                await Notification.create({
                    userId: candidato.id,
                    message: `Parabéns! Você foi contratado(a) para "${vaga.title}" na ${empresa.name}! 🏆`,
                    type: 'success', link: `/jobs/view/${vaga.id}`, read: false
                });
            } else if (status === 'expirado') {
                await Notification.create({
                    userId: candidato.id,
                    message: `A vaga "${vaga.title}" foi encerrada.`,
                    type: 'info', link: `/jobs/view/${vaga.id}`, read: false
                });
            }

            const stageLabel = currentStage ? ` → ${currentStage}` : '';
            console.log(`   ✅ ${candidato.name} → ${vaga.title} [${status}${stageLabel}]`);
        }

        console.log('\n❤️  Criando favoritos...');
        for (const [candIdx, vagaIdx] of favoritos) {
            await Favorite.create({ userId: candidatosCreated[candIdx].id, jobId: vagasCreated[vagaIdx].id });
        }

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ Seed concluído!\n');
        console.log(`   🏢 ${empresasCreated.length} empresas (10 setores)`);
        console.log(`   👤 ${candidatosCreated.length} candidatos`);
        console.log(`   💼 ${vagasCreated.length} vagas (${vagas.filter(v => v.stages && v.stages.length).length} com etapas)`);
        console.log(`   📨 ${candidaturas.length} candidaturas`);
        console.log(`   ❤️  ${favoritos.length} favoritos`);
        console.log(`\n🔑 Senha padrão: ${SENHA_PADRAO}`);
        console.log('\n   Empresas:');
        empresas.forEach(e => console.log(`   - ${e.email}`));
        console.log('\n   Candidatos:');
        candidatos.forEach(c => console.log(`   - ${c.email}`));
        console.log('\n   Vagas com pipeline de etapas:');
        vagas.filter(v => v.stages && v.stages.length).forEach(v => {
            const emp = empresas[v.empresaIndex];
            console.log(`   - "${v.title}" (${emp.name}): ${v.stages.join(' → ')}`);
        });
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        process.exit(0);
    } catch (err) {
        console.error('\n❌ Erro durante o seed:', err);
        process.exit(1);
    }
}

seed();
