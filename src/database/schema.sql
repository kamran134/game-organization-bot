-- ============================================================
-- Production schema snapshot (pg_dump --schema-only) + the migrations
-- table rows, taken 2026-10-11 after HardenSchema1758000000000.
--
-- Bootstrapping an EMPTY database: psql -f schema.sql, then
-- `npm run migration:run` applies only migrations newer than this snapshot.
-- Regenerate after adding a migration (see README, "Схема БД").
-- ============================================================

--
-- PostgreSQL database dump
--


-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: game_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.game_type AS ENUM (
    'GAME',
    'TRAINING'
);


--
-- Name: games_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.games_type_enum AS ENUM (
    'GAME',
    'TRAINING'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: game_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.game_participants (
    id integer NOT NULL,
    game_id integer NOT NULL,
    user_id integer,
    participation_status character varying NOT NULL,
    guest_name character varying,
    "position" integer,
    joined_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: game_participants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.game_participants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: game_participants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.game_participants_id_seq OWNED BY public.game_participants.id;


--
-- Name: games; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.games (
    id integer NOT NULL,
    group_id integer NOT NULL,
    creator_id integer,
    sport_id integer NOT NULL,
    game_date timestamp with time zone NOT NULL,
    location_id integer,
    location_text character varying,
    min_participants integer DEFAULT 2 NOT NULL,
    max_participants integer NOT NULL,
    cost numeric(10,2),
    status character varying DEFAULT 'planned'::character varying NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    type public.games_type_enum DEFAULT 'GAME'::public.games_type_enum NOT NULL,
    registration_lock_hours integer
);


--
-- Name: games_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.games_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: games_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.games_id_seq OWNED BY public.games.id;


--
-- Name: group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_members (
    id integer NOT NULL,
    user_id integer NOT NULL,
    group_id integer NOT NULL,
    role character varying DEFAULT 'member'::character varying NOT NULL,
    joined_at timestamp without time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: group_members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.group_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: group_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.group_members_id_seq OWNED BY public.group_members.id;


--
-- Name: groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.groups (
    id integer NOT NULL,
    name character varying NOT NULL,
    description text,
    telegram_chat_id bigint,
    creator_id integer,
    is_private boolean DEFAULT false NOT NULL,
    invite_code character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: groups_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: groups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.groups_id_seq OWNED BY public.groups.id;


--
-- Name: locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.locations (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    group_id integer NOT NULL,
    map_url character varying(500),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: locations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.locations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: locations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.locations_id_seq OWNED BY public.locations.id;


--
-- Name: migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.migrations (
    id integer NOT NULL,
    "timestamp" bigint NOT NULL,
    name character varying NOT NULL
);


--
-- Name: migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.migrations_id_seq OWNED BY public.migrations.id;


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id integer NOT NULL,
    group_id integer NOT NULL,
    game_id integer,
    period_month character varying(7),
    user_id integer,
    guest_name character varying,
    amount numeric(10,2) NOT NULL,
    confirmed_by integer,
    confirmed_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_payments_game_or_period CHECK ((((game_id IS NOT NULL) AND (period_month IS NULL)) OR ((game_id IS NULL) AND (period_month IS NOT NULL)))),
    CONSTRAINT chk_payments_user_or_guest CHECK (((user_id IS NOT NULL) OR (guest_name IS NOT NULL)))
);


--
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payments_id_seq OWNED BY public.payments.id;


--
-- Name: sport_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sport_locations (
    id integer NOT NULL,
    sport_id integer NOT NULL,
    location_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: sport_locations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sport_locations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sport_locations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sport_locations_id_seq OWNED BY public.sport_locations.id;


--
-- Name: sports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sports (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    emoji character varying(10) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    group_id integer,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: sports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sports_id_seq OWNED BY public.sports.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    telegram_id bigint NOT NULL,
    username character varying,
    first_name character varying,
    last_name character varying,
    phone character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: game_participants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_participants ALTER COLUMN id SET DEFAULT nextval('public.game_participants_id_seq'::regclass);


--
-- Name: games id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.games ALTER COLUMN id SET DEFAULT nextval('public.games_id_seq'::regclass);


--
-- Name: group_members id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members ALTER COLUMN id SET DEFAULT nextval('public.group_members_id_seq'::regclass);


--
-- Name: groups id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups ALTER COLUMN id SET DEFAULT nextval('public.groups_id_seq'::regclass);


--
-- Name: locations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations ALTER COLUMN id SET DEFAULT nextval('public.locations_id_seq'::regclass);


--
-- Name: migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migrations ALTER COLUMN id SET DEFAULT nextval('public.migrations_id_seq'::regclass);


--
-- Name: payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments ALTER COLUMN id SET DEFAULT nextval('public.payments_id_seq'::regclass);


--
-- Name: sport_locations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sport_locations ALTER COLUMN id SET DEFAULT nextval('public.sport_locations_id_seq'::regclass);


--
-- Name: sports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sports ALTER COLUMN id SET DEFAULT nextval('public.sports_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: sports PK_4fa1063d368e1fd68ea63c7d860; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sports
    ADD CONSTRAINT "PK_4fa1063d368e1fd68ea63c7d860" PRIMARY KEY (id);


--
-- Name: game_participants PK_618ce5d9c1d1fc107c16f3d0e17; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_participants
    ADD CONSTRAINT "PK_618ce5d9c1d1fc107c16f3d0e17" PRIMARY KEY (id);


--
-- Name: groups PK_659d1483316afb28afd3a90646e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT "PK_659d1483316afb28afd3a90646e" PRIMARY KEY (id);


--
-- Name: locations PK_7cc1c9e3853b94816c094825e74; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT "PK_7cc1c9e3853b94816c094825e74" PRIMARY KEY (id);


--
-- Name: group_members PK_86446139b2c96bfd0f3b8638852; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT "PK_86446139b2c96bfd0f3b8638852" PRIMARY KEY (id);


--
-- Name: migrations PK_8c82d7f526340ab734260ea46be; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT "PK_8c82d7f526340ab734260ea46be" PRIMARY KEY (id);


--
-- Name: users PK_a3ffb1c0c8416b9fc6f907b7433; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY (id);


--
-- Name: games PK_c9b16b62917b5595af982d66337; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.games
    ADD CONSTRAINT "PK_c9b16b62917b5595af982d66337" PRIMARY KEY (id);


--
-- Name: sport_locations PK_ef2b50eb76edf04b8dd1e5d7dc6; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sport_locations
    ADD CONSTRAINT "PK_ef2b50eb76edf04b8dd1e5d7dc6" PRIMARY KEY (id);


--
-- Name: users UQ_1a1e4649fd31ea6ec6b025c7bfc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "UQ_1a1e4649fd31ea6ec6b025c7bfc" UNIQUE (telegram_id);


--
-- Name: groups UQ_6f0e9a68f59676da788d98e144c; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT "UQ_6f0e9a68f59676da788d98e144c" UNIQUE (telegram_chat_id);


--
-- Name: groups UQ_d93a573770a9d8c51c59c6c0f2d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT "UQ_d93a573770a9d8c51c59c6c0f2d" UNIQUE (invite_code);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: idx_game_participants_game_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_game_participants_game_id ON public.game_participants USING btree (game_id);


--
-- Name: idx_game_participants_unique_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_game_participants_unique_user ON public.game_participants USING btree (game_id, user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_games_group_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_games_group_date ON public.games USING btree (group_id, game_date);


--
-- Name: idx_group_members_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_members_group_id ON public.group_members USING btree (group_id);


--
-- Name: idx_payments_game_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_game_id ON public.payments USING btree (game_id);


--
-- Name: idx_payments_group_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_group_month ON public.payments USING btree (group_id, period_month);


--
-- Name: idx_payments_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_user_id ON public.payments USING btree (user_id);


--
-- Name: uq_group_members_user_group; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_group_members_user_group ON public.group_members USING btree (user_id, group_id);


--
-- Name: uq_payments_game_guest; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_payments_game_guest ON public.payments USING btree (game_id, guest_name) WHERE ((game_id IS NOT NULL) AND (user_id IS NULL));


--
-- Name: uq_payments_game_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_payments_game_user ON public.payments USING btree (game_id, user_id) WHERE ((game_id IS NOT NULL) AND (user_id IS NOT NULL));


--
-- Name: uq_payments_training_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_payments_training_user ON public.payments USING btree (group_id, period_month, user_id) WHERE ((game_id IS NULL) AND (user_id IS NOT NULL));


--
-- Name: uq_sport_locations_sport_location; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_sport_locations_sport_location ON public.sport_locations USING btree (sport_id, location_id);


--
-- Name: ux_sports_base_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_sports_base_name ON public.sports USING btree (name) WHERE (group_id IS NULL);


--
-- Name: ux_sports_group_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_sports_group_name ON public.sports USING btree (group_id, name) WHERE (group_id IS NOT NULL);


--
-- Name: game_participants FK_1f734478543677e66383f1f5bd4; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_participants
    ADD CONSTRAINT "FK_1f734478543677e66383f1f5bd4" FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;


--
-- Name: group_members FK_20a555b299f75843aa53ff8b0ee; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT "FK_20a555b299f75843aa53ff8b0ee" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: games FK_290f3cef9d9bbe77b27209d9341; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.games
    ADD CONSTRAINT "FK_290f3cef9d9bbe77b27209d9341" FOREIGN KEY (creator_id) REFERENCES public.users(id);


--
-- Name: group_members FK_2c840df5db52dc6b4a1b0b69c6e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT "FK_2c840df5db52dc6b4a1b0b69c6e" FOREIGN KEY (group_id) REFERENCES public.groups(id);


--
-- Name: games FK_31b7569b921e24c5c675c753af8; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.games
    ADD CONSTRAINT "FK_31b7569b921e24c5c675c753af8" FOREIGN KEY (location_id) REFERENCES public.locations(id);


--
-- Name: groups FK_33b49cd404bac777f795028c3b0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT "FK_33b49cd404bac777f795028c3b0" FOREIGN KEY (creator_id) REFERENCES public.users(id);


--
-- Name: sport_locations FK_3fc101f7b9372980a93ca8a83c0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sport_locations
    ADD CONSTRAINT "FK_3fc101f7b9372980a93ca8a83c0" FOREIGN KEY (sport_id) REFERENCES public.sports(id);


--
-- Name: games FK_44112a9cbdf6ed12f4620e9d433; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.games
    ADD CONSTRAINT "FK_44112a9cbdf6ed12f4620e9d433" FOREIGN KEY (sport_id) REFERENCES public.sports(id);


--
-- Name: games FK_4476c8f7870590ccb0070016866; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.games
    ADD CONSTRAINT "FK_4476c8f7870590ccb0070016866" FOREIGN KEY (group_id) REFERENCES public.groups(id);


--
-- Name: game_participants FK_58abb585a71bf07640194a62ebd; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_participants
    ADD CONSTRAINT "FK_58abb585a71bf07640194a62ebd" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: locations FK_7361603de2f10fc8f241860a313; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT "FK_7361603de2f10fc8f241860a313" FOREIGN KEY (group_id) REFERENCES public.groups(id);


--
-- Name: sport_locations FK_c0bbeadcabc50c9dc0c49e6afbd; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sport_locations
    ADD CONSTRAINT "FK_c0bbeadcabc50c9dc0c49e6afbd" FOREIGN KEY (location_id) REFERENCES public.locations(id);


--
-- Name: payments payments_confirmed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: payments payments_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_game_id_fkey FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;


--
-- Name: payments payments_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: payments payments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: sports sports_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sports
    ADD CONSTRAINT sports_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id);


--
-- PostgreSQL database dump complete
--


--
-- PostgreSQL database dump
--


-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: migrations; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.migrations VALUES (1, 1707649200000, 'AddGameTypeColumn1707649200000');
INSERT INTO public.migrations VALUES (2, 1738000000000, 'MakeUserIdNullable1738000000000');
INSERT INTO public.migrations VALUES (3, 1745500000000, 'AddRegistrationLockHours1745500000000');
INSERT INTO public.migrations VALUES (4, 1707649200000, 'AddGameTypeColumn1707649200000');
INSERT INTO public.migrations VALUES (5, 1738000000000, 'MakeUserIdNullable1738000000000');
INSERT INTO public.migrations VALUES (6, 1748000000000, 'AddPaymentsTable1748000000000');
INSERT INTO public.migrations VALUES (7, 1748100000000, 'FixPaymentsTableSchema1748100000000');
INSERT INTO public.migrations VALUES (8, 1755000000000, 'AddGroupMemberIsActive1755000000000');
INSERT INTO public.migrations VALUES (9, 1756000000000, 'AddGroupScopedSports1756000000000');
INSERT INTO public.migrations VALUES (10, 1757000000000, 'UniqueGuestPayments1757000000000');
INSERT INTO public.migrations VALUES (11, 1758000000000, 'HardenSchema1758000000000');


--
-- Name: migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.migrations_id_seq', 11, true);


--
-- PostgreSQL database dump complete
--


